// app/api/cancel/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
import { TZ } from '@lib/googleCalendar';
import { assertEnv } from '@lib/assertEnv';
import { adminDb } from '@lib/firebaseAdmin';

// DELETE /api/cancel?eventId=abc123
export async function POST(req: Request) {
  try {
    const { eventId } = await req.json();
    if (!eventId) {
      return NextResponse.json({ ok: false, error: 'Missing eventId' }, { status: 400 });
    }

    assertEnv('GOOGLE_CALENDAR_ID');
    const calendar = await getCalendar();

    // (for SMS) fetch details before deletion, if available
let smsSummary: string | null = null;
let smsStartISO: string | null = null;
let smsCustomerName: string | null = null;
try {
  const getRes = await calendar.events.get({
    calendarId: CALENDAR_ID,
    eventId,
  });
  const ev = getRes.data || {};

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
} catch {
  // ignore — cancellation will still proceed
}



    // Attempt Google Calendar deletion
    try {
      await calendar.events.delete({
        calendarId: CALENDAR_ID,
        eventId,
      });
    } catch (err: any) {
      // Ignore if event already gone
      if (err?.code !== 410 && err?.code !== 404) throw err;
    }

    // Remove any matching hold if still present
    try {
      const snap = await adminDb.collection('holds').where('eventId', '==', eventId).get();
      for (const doc of snap.docs) await doc.ref.delete();
    } catch {}

    // --- ClickSend SMS alert (owner notification on cancellation) ---
try {
  if (
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


    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Cancel error:', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
