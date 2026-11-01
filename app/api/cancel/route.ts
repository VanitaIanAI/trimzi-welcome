import { calendarMutation } from '@lib/calendarMutation';
// app/api/cancel/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
import { TZ } from '@lib/googleCalendar';
import { assertEnv } from '@lib/assertEnv';
import { adminDb } from '@lib/firebaseAdmin';

// DELETE /api/cancel?eventId=abc123
// Prefer HTTP statuses; a network error code is not an HTTP response.
function calendarHttpStatus(err: any): number | undefined {
  for (const value of [err?.response?.status, err?.status, err?.code]) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) return value;
    if (typeof value === 'string' && /^[1-5]\d{2}$/.test(value)) return Number(value);
  }
  return undefined;
}

export async function POST(req: Request) {
  try {
    const { eventId } = await req.json();
    if (!eventId) {
      return NextResponse.json({ ok: false, error: 'Missing eventId' }, { status: 400 });
    }

    assertEnv('GOOGLE_CALENDAR_ID');
    const calendar = await getCalendar();

     // (for SMS / refund logic) fetch details before deletion, if available
    let smsSummary: string | null = null;
    let smsStartISO: string | null = null;
    let smsCustomerName: string | null = null;
    let autoRefundEligible: boolean | null = null;
    let eventWasActive = false;
    let cancelledNow = false;

    await calendarMutation(async assertOwnership => {
    try {
      const getRes = await calendar.events.get({
        calendarId: CALENDAR_ID,
        eventId,
      });
      const ev = getRes.data || {};
      eventWasActive = ev.status !== 'cancelled';

      // Service summary (we set this when creating the event)
      smsSummary = typeof ev.summary === 'string' ? ev.summary : null;

      // Start time (ISO)
      smsStartISO =
        (ev.start && (ev.start as any).dateTime) ||
        (ev.start && (ev.start as any).date) || // all-day fallback
        null;

      // Prefer the private extended property we set on create
      const priv = (ev.extendedProperties && (ev.extendedProperties as any).private) || {};

      if (priv && typeof (priv as any).customerName === 'string' && (priv as any).customerName.trim()) {
        smsCustomerName = (priv as any).customerName.trim();
      } else if (smsSummary && smsSummary.includes(' — ')) {
        // Fallback: our summary is "<service> — <customerName>"
        const parts = smsSummary.split(' — ');
        smsCustomerName = parts[parts.length - 1]?.trim() || null;
      }

      // NEW: compute whether this booking is eligible for automatic refund
      // (once payments are wired in). For now this is metadata only.
      const paymentMethod =
        typeof (priv as any).paymentMethod === 'string' ? (priv as any).paymentMethod : null;
      const paymentStatus =
        typeof (priv as any).paymentStatus === 'string' ? (priv as any).paymentStatus : null;

      const isPayNow = paymentMethod === 'pay_now';
      const isPaid = paymentStatus === 'paid';

      if (smsStartISO) {
        const startTimeMs = new Date(smsStartISO).getTime();
        const nowMs = Date.now();
        const diffHours = (startTimeMs - nowMs) / (1000 * 60 * 60);
        const isMoreThan24HoursBefore = diffHours >= 24;
        autoRefundEligible = Boolean(isPayNow && isPaid && isMoreThan24HoursBefore);
      } else {
        autoRefundEligible = null;
      }
    } catch (err: any) {
      const status = calendarHttpStatus(err);
      if (status !== 404 && status !== 410) throw err;
    }

    // Google GET can return a deleted event with status "cancelled".
    // Keep cleanup on repeat requests, but notify only for a new deletion.
    if (eventWasActive) {
      try {
        await assertOwnership();
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
        cancelledNow = true;
      } catch (err: any) {
        const status = calendarHttpStatus(err);
        if (status !== 404 && status !== 410) throw err;
      }
    }

    });

    // Remove any matching hold if still present
    try {
      const snap = await adminDb.collection('holds').where('eventId', '==', eventId).get();
      for (const doc of snap.docs) await doc.ref.delete();
    } catch {}

    // --- ClickSend SMS alert (owner notification on cancellation) ---
try {
  if (
    cancelledNow &&
    process.env.CLICKSEND_USERNAME &&
    process.env.CLICKSEND_API_KEY &&
    process.env.ALERT_SMS_TO &&
    process.env.SMS_SENDER
  ) {
    // Build a readable time (if we captured it)
    const whenStr = smsStartISO
      ? new Date(smsStartISO).toLocaleString('en-GB', {
          timeZone: TZ,
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'time unknown';

    const bodyText =
  `Booking cancelled (in-app).\n` +
  (smsCustomerName ? `Customer: ${smsCustomerName}\n` : '') +
  (smsSummary ? `Service: ${smsSummary}\n` : '') +
  `When: ${whenStr}`;

    const payload = {
      messages: [
        {
          source: 'trimzi-app',
          body: bodyText,
          to: process.env.ALERT_SMS_TO,   // e.g. +4479...
          from: process.env.SMS_SENDER,   // your approved alpha tag or number
        },
      ],
    };

    const authB64 = Buffer
      .from(`${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`)
      .toString('base64');

    await fetch('https://rest.clicksend.com/v3/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authB64}`,
      },
      body: JSON.stringify(payload),
    });
  }
} catch (e) {
  // Never fail the cancellation because SMS failed
  console.warn('ClickSend SMS (cancel, in-app) failed:', e);
}


       return NextResponse.json({
      ok: true,
      // NEW: whether this booking *would* be auto-refunded (pay_now + paid + cancelled ≥24h before).
      autoRefundEligible: autoRefundEligible === true,
    });
  } catch (err: any) {
    console.error('Cancel error:', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Internal error' }, { status: err?.diaryStatus || 500 });
  }
}
