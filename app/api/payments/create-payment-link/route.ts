// app/api/payments/create-payment-link/route.ts

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { amount, currency = 'GBP', eventId, serviceName } = await req.json();

    // amount is expected in minor units: e.g. 2200 = £22.00
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid amount' },
        { status: 400 }
      );
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

    const idempotencyKey = randomUUID();

    const squareRes = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
      method: 'POST',
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
          redirect_url: `${process.env.APP_BASE_URL}/booking/confirmed?eventId=${eventId ?? ''}`,
        },

        payment_note: eventId ? `Trimzi calendar event: ${eventId}` : undefined,
      }),
    });

    const json = await squareRes.json();

    if (!squareRes.ok || !json?.payment_link?.url) {
      console.error('Square payment link error:', json);
      return NextResponse.json(
        { ok: false, error: 'Failed to create payment link' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      url: json.payment_link.url as string,
      id: json.payment_link.id as string,
    });
  } catch (err: any) {
    console.error('Square payment link unexpected error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unexpected error' },
      { status: 500 }
    );
  }
}
