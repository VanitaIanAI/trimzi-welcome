// app/api/cancel/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Cancel error:', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
