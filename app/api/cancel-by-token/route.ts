// app/api/cancel-by-token/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('cancel-by-token error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}
