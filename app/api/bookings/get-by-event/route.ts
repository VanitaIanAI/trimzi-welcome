// app/api/bookings/get-by-event/route.ts

import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
import { adminDb } from '@lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: 'Missing eventId' },
        { status: 400 }
      );
    }

    const calendar = await getCalendar();

    // 1) Load the Google Calendar event
    const evRes = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId,
    });

    const ev = evRes.data || {};

    // Extract start time
    const startISO: string | null =
      (ev.start && (ev.start as any).dateTime) ||
      (ev.start && (ev.start as any).date
        ? `${(ev.start as any).date}T00:00:00.000Z`
        : null);

    // Service / barber / note from description + private props
    let serviceName: string | null =
      typeof ev.summary === 'string' ? ev.summary : null;
    let barberName: string | null = null;
    let note: string | null = null;
    let paymentStatus: string | null = null;

    const desc = typeof ev.description === 'string' ? ev.description : '';
    if (desc) {
      const lines = desc.split('\n').map((l) => l.trim());
      for (const line of lines) {
        const lower = line.toLowerCase();

        // "Service: <name>"
        if (lower.startsWith('service:')) {
          const v = line.slice('service:'.length).trim();
          if (v) serviceName = v;
        }

        // "Barber: <name>" (in any of the lines)
        if (lower.includes('barber:')) {
          const m = line.match(/barber:\s*(.+)$/i);
          if (m && m[1]) barberName = m[1].trim();
        }

        // "Note from customer: <text>"
        if (lower.startsWith('note from customer:')) {
          const v = line.slice('note from customer:'.length).trim();
          if (v) note = v;
        }
      }
    }

    const priv =
      (ev.extendedProperties &&
        (ev.extendedProperties as any).private) ||
      {};

    if (!barberName && typeof (priv as any).barberName === 'string') {
      barberName = (priv as any).barberName;
    }
    if (typeof (priv as any).paymentStatus === 'string') {
      paymentStatus = (priv as any).paymentStatus;
    }

    // 2) Try to enrich from Firestore "bookings" docs (price, etc.)
    let price: number | null = null;

    try {
      const snap = await adminDb
        .collectionGroup('bookings')
        .where('eventId', '==', eventId)
        .limit(1)
        .get();

      if (!snap.empty) {
        const data = snap.docs[0].data() as any;

        if (typeof data.price === 'number') price = data.price;

        if (!serviceName && typeof data.serviceName === 'string') {
          serviceName = data.serviceName;
        }
        if (!barberName && typeof data.barberName === 'string') {
          barberName = data.barberName;
        }
        if (!paymentStatus && typeof data.paymentStatus === 'string') {
          paymentStatus = data.paymentStatus;
        }
        if (!note && typeof data.note === 'string') {
          note = data.note;
        }
      }
    } catch (e) {
      console.warn(
        'get-by-event: Firestore lookup failed (continuing with calendar only)',
        e
      );
    }

    return NextResponse.json({
      ok: true,
      eventId,
      serviceName,
      barberName,
      startISO,
      price,
      note,
      paymentStatus,
    });
  } catch (err: any) {
    console.error('get-by-event unexpected error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Internal error' },
      { status: 500 }
    );
  }
}