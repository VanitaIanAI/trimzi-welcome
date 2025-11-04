
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// app/api/cancel-by-email/route.ts

import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID, TZ } from '@lib/googleCalendar';
import { adminDb } from '@lib/firebaseAdmin';
import { verifyCancelToken } from '@lib/token';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

    const data = verifyCancelToken(token);
    if (!data?.eventId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });

    const calendar = await getCalendar();

    // (for SMS) fetch details before deletion, if available
let smsSummary: string | null = null;
let smsStartISO: string | null = null;
let smsCustomerName: string | null = null;
try {
  const getRes = await calendar.events.get({
    calendarId: CALENDAR_ID,
    eventId: data.eventId,
  });
  const ev = getRes.data || {};

  // Service summary (we set this when creating the event)
  smsSummary = typeof ev.summary === 'string' ? ev.summary : null;

  // Start time (ISO)
  smsStartISO =
    (ev.start && (ev.start as any).dateTime) ||
    (ev.start && (ev.start as any).date) ||
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
  // ignore — proceed regardless
}



    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: data.eventId }).catch(() => {});

    if (data.uid) {
      await adminDb.collection('users').doc(data.uid)
        .collection('bookings').doc(data.eventId).delete().catch(() => {});
    }

    // --- ClickSend SMS alert (owner notification on cancellation) ---
try {
  if (
    process.env.CLICKSEND_USERNAME &&
    process.env.CLICKSEND_API_KEY &&
    process.env.ALERT_SMS_TO &&
    process.env.SMS_SENDER
  ) {

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
      `Booking cancelled (via email link).\n` +
      (smsCustomerName ? `Customer: ${smsCustomerName}\n` : '') +
      (smsSummary ? `Service: ${smsSummary}\n` : '') +
      `When: ${whenStr}`;


    const payload = {
      messages: [
        {
          source: 'trimzi-app',
          body: bodyText,
          to: process.env.ALERT_SMS_TO,
          from: process.env.SMS_SENDER,
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
  console.warn('ClickSend SMS (cancel, email GET) failed:', e);
}


    return NextResponse.redirect(`${process.env.APP_BASE_URL || 'https://trimzi.co.uk'}/cancel/success`);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }
}