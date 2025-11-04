export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// app/api/cancel-by-token/route.ts

import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID, TZ } from '@lib/googleCalendar';
import { assertEnv } from '@lib/assertEnv';
import { adminDb } from '@lib/firebaseAdmin';
import { verifyCancelToken } from '@lib/token';

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 });
    }

    const decoded = verifyCancelToken(token);
    if (!decoded || !decoded.eventId) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 400 });
    }

    const { eventId } = decoded as { eventId: string };

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
  // ignore — proceed with deletion
}



    // 1) Remove the Google Calendar event (ignore 404/410)
    try {
      await calendar.events.delete({
        calendarId: CALENDAR_ID,
        eventId,
      });
    } catch (err: any) {
      const code = err?.code || err?.response?.status;
      if (code !== 404 && code !== 410) {
        throw err;
      }
    }

    // 2) Remove any user booking docs that reference this eventId
    //    Using collectionGroup so we don't need a user id to find them.
    try {
      const snap = await adminDb
        .collectionGroup('bookings')
        .where('eventId', '==', eventId)
        .get();

      const batch = adminDb.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) {
        await batch.commit();
      }
    } catch (e) {
      // Don't fail cancellation if Firestore cleanup has a transient hiccup.
      console.warn('Firestore cleanup warning:', e);
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
  `Booking cancelled (in-app).\n` +
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
  console.warn('ClickSend SMS (cancel, token) failed:', e);
}



    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('cancel-by-token error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
