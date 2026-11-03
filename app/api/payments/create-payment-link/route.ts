// app/api/payments/create-payment-link/route.ts

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
import { adminDb } from '@lib/firebaseAdmin';
import { expectedPrice, validPaymentToken, orderRef, paymentHash } from '@lib/squarePayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {eventId} = body;
    if (typeof eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,1024}$/.test(eventId)) {
      return NextResponse.json({ok:false,error:'Missing or invalid booking'}, {status:400});
    }
    const calendar = await getCalendar();
    let event;
    try { event = (await calendar.events.get({calendarId:CALENDAR_ID,eventId})).data; }
    catch (e: any) {
      if ([404,410].includes(Number(e?.response?.status || e?.code))) return NextResponse.json({ok:false,error:'Booking is no longer available'}, {status:409});
      throw e;
    }
    if (event.status === 'cancelled') return NextResponse.json({ok:false,error:'Booking is no longer available'}, {status:409});
    const props = event.extendedProperties?.private || {};
    const secured = !!props.paymentValidation;
    let amount = body.amount, currency = body.currency || 'GBP', serviceName = body.serviceName || 'Trimzi booking';
    if (secured) {
      if (props.paymentValidation !== 'v1' || !validPaymentToken(body.paymentToken, props.paymentTokenHash)) {
        return NextResponse.json({ok:false,error:'Payment authorisation is missing or invalid'}, {status:403});
      }
      if (props.paymentStatus !== 'unpaid') return NextResponse.json({ok:false,error:'This booking is not awaiting payment'}, {status:409});
      ({amount,currency,serviceName} = expectedPrice(props));
    } else if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      // Existing bookings retain their original payment-price behaviour.
      return NextResponse.json({ok:false,error:'Missing or invalid amount'}, {status:400});
    }

    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    const env = process.env.SQUARE_ENVIRONMENT || 'production';

    if (!accessToken || !locationId) {
      // Misconfiguration on the server – do NOT expose secrets, just a generic error
      return NextResponse.json(
        { ok: false, error: 'Square is not configured on the server' },
        { status: 500 }
      );
    }

    const baseUrl =
      env === 'sandbox'
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com';

    // Retries for new bookings reuse the same Square order.
    const idempotencyKey = secured ? paymentHash(`${CALENDAR_ID}:${eventId}:${props.paymentTokenHash}`) : randomUUID();

    const squareRes = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        // Keep Square version explicit so behaviour is stable over time
        'Square-Version': '2025-10-16',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        quick_pay: {
          name: serviceName || 'Trimzi booking',
          price_money: {
            amount,        // minor units: pence
            currency,      // "GBP"
          },
          location_id: locationId,
        },
            checkout_options: {
          redirect_url: `${process.env.APP_BASE_URL}/booking/confirmed?eventId=${encodeURIComponent(eventId)}`,
        },

        payment_note: eventId ? `Trimzi calendar event: ${eventId}` : undefined,
      }),
    });

    const json = await squareRes.json();

    if (!squareRes.ok || !json?.payment_link?.url || (secured && !json?.payment_link?.order_id)) {
      console.error('[Square payment link] Provider did not return a usable link.');
      return NextResponse.json(
        { ok: false, error: 'Failed to create payment link' },
        { status: 500 }
      );
    }

    if (secured) {
      const orderId = json.payment_link.order_id;
      const ref = orderRef(orderId);
      await adminDb.runTransaction(async tx => {
        const existing = await tx.get(ref);
        const saved = existing.data();
        if (existing.exists && (saved?.eventId !== eventId || saved?.calendarId !== CALENDAR_ID || saved?.amount !== amount || saved?.currency !== currency || saved?.locationId !== locationId)) {
          throw new Error('Conflicting payment order binding');
        }
        if (!existing.exists) tx.create(ref, {version:'v1',calendarId:CALENDAR_ID,eventId,orderId,amount,currency,locationId,createdAt:new Date().toISOString()});
      });
    }

    return NextResponse.json({
      ok: true,
      url: json.payment_link.url as string,
      id: json.payment_link.id as string,
    });
  } catch (err: any) {
    console.error('[Square payment link] Payment link creation incomplete.');
    return NextResponse.json(
      { ok: false, error: 'Unable to start online payment; your booking remains confirmed' },
      { status: 500 }
    );
  }
}
