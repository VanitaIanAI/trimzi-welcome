// app/api/webhooks/square/route.ts

import { NextResponse } from 'next/server';
import { adminDb } from '@lib/firebaseAdmin';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Small helper so we don't throw if the shape isn't what we expect
function safeGetPayment(payload: any) {
  return payload?.data?.object?.payment ?? null;
}

export async function POST(req: Request) {
  try {
    // We don't do signature verification yet (can be added later with the
    // Square webhook signature key). For now, just parse JSON safely.
    const bodyText = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch (e) {
      console.error('Square webhook: invalid JSON', e);
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const eventType = payload?.type;
    if (eventType !== 'payment.updated' && eventType !== 'payment.created') {
      // Ignore events we don't care about
      return NextResponse.json({ ok: true, ignored: true });
    }

    const payment = safeGetPayment(payload);
    if (!payment) {
      console.warn('Square webhook: no payment object in payload');
      return NextResponse.json({ ok: true, ignored: true });
    }

    const status: string | undefined = payment.status;
    const paymentId: string | undefined = payment.id;
    const note: string = payment.note || '';

    // Only treat COMPLETED payments as "paid"
    if (status !== 'COMPLETED') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Try to recover the Google Calendar eventId that we embedded when we
    // created the payment link.
    //
    // Earlier we set:
    //   payment_note: `Trimzi calendar event: ${eventId}`
    //
    // So here we parse it back out of payment.note.
    let eventId: string | null = null;

    // If at some point we start putting eventId into payment.metadata,
    // prefer that:
    const metaEventId: string | undefined =
      payment.metadata?.trimzi_event_id || payment.metadata?.eventId;

    if (metaEventId && typeof metaEventId === 'string') {
      eventId = metaEventId;
    } else if (typeof note === 'string' && note) {
      const m = note.match(/Trimzi\s+calendar\s+event:\s*([^\s]+)/i);
      if (m && m[1]) {
        eventId = m[1];
      }
    }

    if (!eventId) {
      console.warn('Square webhook: COMPLETED payment but no eventId found', {
        paymentId,
        note,
      });
      // Acknowledge to Square so it doesn’t retry, but we can’t map it.
      return NextResponse.json({ ok: true, missingEventId: true });
    }

    // 1) Update Firestore bookings (for all users that reference this eventId)
    try {
      const snap = await adminDb
        .collectionGroup('bookings')
        .where('eventId', '==', eventId)
        .get();

      if (!snap.empty) {
        const batch = adminDb.batch();
        for (const d of snap.docs) {
          batch.set(
            d.ref,
            {
              paymentStatus: 'paid',
              paymentMethod: 'pay_now', // specifically online via link
              squarePaymentId: paymentId || null,
              squarePaymentStatus: status,
              squareNote: note || null,
              // Optional: when we got the webhook
              paymentUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        }
        await batch.commit();
      } else {
        console.warn('Square webhook: no Firestore bookings found for eventId', {
          eventId,
          paymentId,
        });
      }
    } catch (e) {
      console.error('Square webhook: failed to update Firestore bookings', e);
      // We still continue to try updating Calendar; we don't want to 500 here
    }

    // 2) Update the Google Calendar event to mark it as paid
    try {
      const calendar = await getCalendar();
      const getRes = await calendar.events.get({
        calendarId: CALENDAR_ID,
        eventId,
      });

      const ev = getRes.data || {};
      const existingDescription =
        (typeof ev.description === 'string' && ev.description) || '';

      const existingPrivateProps: Record<string, any> =
        (ev.extendedProperties &&
          (ev.extendedProperties as any).private) ||
        {};

     // --- Update the *existing* booking text rather than appending conflicting info ---
// We want to convert:
//   "Payment status: unpaid"  -> "Payment status: paid"
// and avoid leaving both "paid" and "unpaid" in the same description.

function setOrReplaceLine(desc: string, key: string, value: string) {
  const lines = (desc || '').split('\n');
  const re = new RegExp(`^${key}\\s*:\\s*.*$`, 'i');

  let replaced = false;
  const out = lines.map((line) => {
    if (re.test(line)) {
      replaced = true;
      return `${key}: ${value}`;
    }
    return line;
  });

  if (!replaced) {
    // If the line wasn't present, append it neatly.
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    out.push(`${key}: ${value}`);
  }

  return out.join('\n');
}

// Start with whatever is already there
let newDescription = existingDescription;

// Force the “Payment status” line to match the real payment state
newDescription = setOrReplaceLine(newDescription, 'Payment status', 'paid');

// Optional: also ensure the method line is consistent for paid online payments
newDescription = setOrReplaceLine(newDescription, 'Payment method', 'Pay online');

// Also add a short paid marker line (only once)
if (!/Payment:\s*PAID/i.test(newDescription)) {
  newDescription = (newDescription ? newDescription + '\n\n' : '') + 'Payment: PAID online via Square.';
}

      const newPrivateProps = {
        ...existingPrivateProps,
        paymentStatus: 'paid',
        paymentMethod: 'pay_now', // i.e. online prepayment
        squarePaymentId: paymentId || '',
        squarePaymentStatus: status,
      };

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId,
        requestBody: {
          colorId: '10', // Green = paid
          description: newDescription,
          extendedProperties: {
            private: newPrivateProps,
          },
        },
      });
    } catch (e) {
      console.error('Square webhook: failed to update Google Calendar event', e);
      // Don’t 500 – we still acknowledge the webhook, Square will not retry
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Square webhook: unexpected error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}