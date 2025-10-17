// app/api/bookings/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID, TZ } from '@lib/googleCalendar';
import { assertEnv } from '@lib/assertEnv';

export async function POST(req: Request) {
  try {
    assertEnv('GOOGLE_CALENDAR_ID');

    const body = await req.json();
    // Expected body:
    // {
    //   summary: "Men's - Scissor cut",
    //   description: "Booked via Trimzi",
    //   startISO: "2025-09-22T09:30:00",
    //   endISO:   "2025-09-22T10:10:00",
    //   attendeeEmail?: "customer@example.com",
    //   barberName?: "Ian"
    // }

    const { summary, description, startISO, endISO, attendeeEmail, barberName, customerName, customerPhone } = body;

    if (!summary || !startISO || !endISO) {
      return NextResponse.json({ error: 'summary, startISO and endISO are required' }, { status: 400 });
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
  start: { dateTime: startISO, timeZone: TZ },
  end: { dateTime: endISO, timeZone: TZ },
  attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
  reminders: { useDefault: true },
  // Keep phone/name searchable but out of the title:
  extendedProperties: {
    private: {
      customerName: customerName || '',
      customerPhone: customerPhone || '',
    },
  },
};

    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      sendUpdates: attendeeEmail ? 'all' : 'none',
    });

    return NextResponse.json({ ok: true, eventId: res.data.id, htmlLink: res.data.htmlLink });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}
