// app/api/bookings/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID, TZ } from '@lib/googleCalendar';
import { assertEnv } from '@lib/assertEnv';
import { adminDb } from '@lib/firebaseAdmin';
import { addMinutes, fetchBusyIntervals, overlaps } from '@lib/availability';

export async function POST(req: Request) {
  try {
    assertEnv('GOOGLE_CALENDAR_ID');

    const body = await req.json();
    const { summary, description, startISO, attendeeEmail, barberName, customerName, customerPhone, holdId, date } = body;

    if (!summary || !startISO || !date) {
      return NextResponse.json({ error: 'summary, date and startISO are required' }, { status: 400 });
    }

    // Always 45 minutes
    const start = new Date(startISO);
    const end = addMinutes(start, 45);
    const endISO = end.toISOString();

    // 1) Check conflicts now (calendar + active holds)
    const busy = await fetchBusyIntervals(date);

    if (holdId) {
      const snap = await adminDb.collection('holds').doc(holdId).get();
      const h = snap.exists ? (snap.data() as any) : null;
      const now = Date.now();
      const exp = h?.expiresAt?.toMillis?.() ?? h?.expiresAt;
      if (exp && exp > now) {
        busy.push({ start: new Date(h.startISO), end: new Date(h.endISO) });
      }
    }

    const conflict = busy.some(b => overlaps({ start, end }, b));
    if (conflict) {
      return NextResponse.json({ error: 'Slot just taken. Please pick another time.' }, { status: 409 });
    }

    const calendar = await getCalendar();

    const prettyDesc = [
      description ?? `Booked via Trimzi${barberName ? ` · Barber: ${barberName}` : ''}`,
      '',
      customerName ? `Customer: ${customerName}` : null,
      customerPhone ? `Phone: ${customerPhone}` : null,
      summary ? `Service: ${summary}` : null,
    ].filter(Boolean).join('\n');

    const event = {
      summary: customerName ? `${summary} — ${customerName}` : summary,
      description: prettyDesc,
      start: { dateTime: start.toISOString(), timeZone: TZ },
      end:   { dateTime: endISO,            timeZone: TZ },
      attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
      reminders: { useDefault: true },
      extendedProperties: {
        private: { customerName: customerName || '', customerPhone: customerPhone || '' },
      },
      transparency: 'opaque',
    } as const;

    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      sendUpdates: attendeeEmail ? 'all' : 'none',
    });

    if (holdId) await adminDb.collection('holds').doc(holdId).delete().catch(() => {});

    return NextResponse.json({ ok: true, eventId: res.data.id, htmlLink: res.data.htmlLink });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}