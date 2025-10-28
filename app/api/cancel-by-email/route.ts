import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
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
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: data.eventId }).catch(() => {});

    if (data.uid) {
      await adminDb.collection('users').doc(data.uid)
        .collection('bookings').doc(data.eventId).delete().catch(() => {});
    }

    return NextResponse.redirect(`${process.env.APP_BASE_URL || 'https://trimzi.co.uk'}/cancel/success`);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }
}