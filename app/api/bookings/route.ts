// app/api/bookings/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID, TZ } from '@lib/googleCalendar';
import { assertEnv } from '@lib/assertEnv';
import { adminDb } from '@lib/firebaseAdmin';
import { addMinutes, fetchBusyIntervals, overlaps } from '@lib/availability';
import sgMail from '@sendgrid/mail';
import { signCancelToken } from '@lib/token';

export async function POST(req: Request) {
  try {
    assertEnv('GOOGLE_CALENDAR_ID');

    // Init SendGrid if configured (safe no-op if missing in dev)
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

    const body = await req.json();
    const {
  summary,
  description,
  startISO,
  attendeeEmail,
  barberName,
  customerName,
  customerPhone,
  holdId,
  date,
  // NEW:
  noteText,
} = body;

    if (!summary || !startISO || !date) {
      return NextResponse.json({ error: 'summary, date and startISO are required' }, { status: 400 });
    }

    // Always 45 minutes
    const start = new Date(startISO);
    const end = addMinutes(start, 45);
    const endISO = end.toISOString();

    // 1) Check conflicts now (calendar + active holds), but DO NOT self-conflict on your own hold
const busy = await fetchBusyIntervals(date);

// Normalize barber for holds (same casing used elsewhere)
const barber = (barberName || 'Ian').charAt(0).toUpperCase() + (barberName || 'Ian').slice(1).toLowerCase();

// If a holdId is provided, verify the hold and keep it OUT of the busy list
let selfHoldWindow: { start: Date; end: Date } | null = null;
const nowMs = Date.now();

if (holdId) {
  const snap = await adminDb.collection('holds').doc(holdId).get();
  const h = snap.exists ? (snap.data() as any) : null;

  // Validate hold is active
  const expMs =
    h?.expiresAt?.toMillis?.() ??
    (typeof h?.expiresAt === 'number' ? h.expiresAt : Date.parse(h?.expiresAt ?? ''));
  const isActive = !!expMs && expMs > nowMs;

  // Validate hold matches this selection (date/barber/start==startISO, end==start+45m)
  const holdStart = h?.startISO ? new Date(h.startISO) : null;
  const holdEnd   = h?.endISO ? new Date(h.endISO) : null;
  const matchesWindow =
    !!holdStart &&
    !!holdEnd &&
    Math.abs(holdStart.getTime() - start.getTime()) < 1000 && // same second
    Math.abs(holdEnd.getTime() - end.getTime()) < 1000 &&
    h?.date === date &&
    (h?.barber || 'Ian') === barber;

  if (!isActive || !matchesWindow) {
    return NextResponse.json({ error: 'Hold expired or mismatched. Please reselect the time.' }, { status: 409 });
  }

  selfHoldWindow = { start: holdStart!, end: holdEnd! };
}

// Add all OTHER active holds for the same date/barber to busy (exclude our own holdId)
const holdsSnap = await adminDb
  .collection('holds')
  .where('date', '==', date)
  .where('barber', '==', barber)
  .get();

for (const d of holdsSnap.docs) {
  const hd = d.data() as any;
  if (holdId && d.id === holdId) continue; // skip our own hold

  const expMs =
    hd?.expiresAt?.toMillis?.() ??
    (typeof hd?.expiresAt === 'number' ? hd.expiresAt : Date.parse(hd?.expiresAt ?? ''));
  if (!expMs || expMs <= nowMs) continue; // only active holds

  if (hd?.startISO && hd?.endISO) {
    busy.push({ start: new Date(hd.startISO), end: new Date(hd.endISO) });
  }
}

// Now check for conflicts (calendar busy + other active holds)
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
  noteText ? '' : null,
  noteText ? `Note from customer: ${noteText}` : null,
].filter(Boolean).join('\n');

   // Build Google Calendar event (no attendees to avoid service account invite error)
const event = {
  summary: customerName ? `${summary} — ${customerName}` : summary,
  description: prettyDesc,
  start: { dateTime: start.toISOString(), timeZone: TZ },
  end:   { dateTime: endISO,             timeZone: TZ },
  reminders: { useDefault: true },
  extendedProperties: {
    private: { customerName: customerName || '', customerPhone: customerPhone || '' },
  },
  transparency: 'opaque',
} as const;

    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      sendUpdates: 'none',
    });

    const eventId = typeof res.data.id === 'string' && res.data.id ? res.data.id : crypto.randomUUID();

    if (holdId) await adminDb.collection('holds').doc(holdId).delete().catch(() => {});

    // Send customer confirmation email via SendGrid (only if we have an email & key)
try {
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM && attendeeEmail) {
    const when = new Date(startISO).toLocaleString('en-GB', {
      timeZone: TZ,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const safeService = summary || 'Trimzi Booking';
    const safeBarber = barberName || 'Ian';

const cancelToken = signCancelToken({ eventId: eventId });
const cancelUrl = `${process.env.APP_BASE_URL || 'https://trimzi.co.uk'}/cancel?token=${cancelToken}`;

    await sgMail.send({
      to: attendeeEmail,
      from: process.env.SENDGRID_FROM,
      subject: `Your Trimzi booking is confirmed — ${when}`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#2b2b2b">
          <h2 style="margin:0 0 12px">Booking confirmed 🎉</h2>
          <p style="margin:0 0 12px">Hi${customerName ? ' ' + customerName : ''},</p>
          <p style="margin:0 0 12px">Your booking is confirmed:</p>
          <ul style="margin:0 0 12px;padding-left:18px">
            <li><strong>Service:</strong> ${safeService}</li>
            <li><strong>Barber:</strong> ${safeBarber}</li>
            <li><strong>When:</strong> ${when} (${TZ})</li>
            ${customerPhone ? `<li><strong>Phone on file:</strong> ${customerPhone}</li>` : ''}
          </ul>
          ${
            noteText
              ? `<p style="margin:0 0 12px"><strong>Your note:</strong> ${String(noteText).replace(/</g,'&lt;')}</p>`
              : ''
          }
          <p style="margin:12px 0">
  <a href="${cancelUrl}" style="color:#c00;font-weight:bold;text-decoration:underline;">
    Cancel this booking
  </a>
</p>
          
          <p style="margin:16px 0 0">If you need to change this booking, please contact the shop directly.</p>
          <p style="margin:8px 0 0">— Trimzi</p>
        </div>
      `,
    });
  }
} catch (e) {
  // Never fail the booking because email failed
  console.warn('SendGrid email failed:', e);
}

    return NextResponse.json({ ok: true, eventId: eventId, htmlLink: res.data.htmlLink });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}