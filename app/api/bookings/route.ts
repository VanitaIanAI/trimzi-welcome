// app/api/bookings/route.ts
import { NextResponse } from 'next/server';
import { getCalendar, CALENDAR_ID, TZ } from '@lib/googleCalendar';
import { assertEnv } from '@lib/assertEnv';
import { adminDb } from '@lib/firebaseAdmin';
import { addMinutes, fetchBusyIntervals, overlaps } from '@lib/availability';
import sgMail from '@sendgrid/mail';
import { signCancelToken } from '@lib/token';
import { randomUUID } from 'crypto';

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
      noteText,
      // NEW: payment metadata (may be missing for older clients)
      paymentMethod,
      paymentStatus,
    } = body as {
      summary?: string;
      description?: string;
      startISO?: string;
      attendeeEmail?: string | null;
      barberName?: string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      holdId?: string | null;
      date?: string;
      noteText?: string | null;
      paymentMethod?: 'pay_now' | 'pay_later';
      paymentStatus?: 'unpaid' | 'paid' | 'partially_paid' | 'refunded';
    };

    if (!summary || !startISO || !date) {
      return NextResponse.json({ error: 'summary, date and startISO are required' }, { status: 400 });
    }

// Normalise payment metadata – older clients may not send it
    const normalisedPaymentMethod: 'pay_now' | 'pay_later' =
      paymentMethod === 'pay_now' ? 'pay_now' : 'pay_later';

    const normalisedPaymentStatus: 'unpaid' | 'paid' | 'partially_paid' | 'refunded' =
      paymentStatus === 'paid' ||
      paymentStatus === 'partially_paid' ||
      paymentStatus === 'refunded'
        ? paymentStatus
        : 'unpaid';

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
      `Payment method: ${normalisedPaymentMethod === 'pay_now' ? 'Pay online' : 'Pay on the day'}`,
      `Payment status: ${normalisedPaymentStatus}`,
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
    private: {
      customerName: customerName || '',
      customerPhone: customerPhone || '',
      paymentMethod: normalisedPaymentMethod,
      paymentStatus: normalisedPaymentStatus,
    },
  },
  transparency: 'opaque',
} as const;

    const res = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
      sendUpdates: 'none',
    });

    const eventId = typeof res.data.id === 'string' && res.data.id ? res.data.id : randomUUID();

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

    const paymentMethodLabel =
      normalisedPaymentMethod === 'pay_now' ? 'Pay online' : 'Pay on the day';

    const cancellationPolicyHtml =
      normalisedPaymentMethod === 'pay_now'
        ? `
          <p style="margin:12px 0 0;font-size:13px;color:#444;">
            If you cancel more than 24 hours before your appointment, any online payment will normally be refunded.
            Cancellations within 24 hours are <strong>not subject to automatic refund</strong> and any refund will be at your barber&apos;s discretion.
          </p>
        `
        : `
          <p style="margin:12px 0 0;font-size:13px;color:#444;">
            You chose to pay on the day. Cancellations within 24 hours of your appointment may still be charged at your barber&apos;s discretion.
          </p>
        `;

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
            <li><strong>Payment:</strong> ${paymentMethodLabel}</li>
            ${customerPhone ? `<li><strong>Phone on file:</strong> ${customerPhone}</li>` : ''}
          </ul>
          ${
            noteText
              ? `<p style="margin:0 0 12px"><strong>Your note:</strong> ${String(noteText).replace(/</g,'&lt;')}</p>`
              : ''
          }
          ${cancellationPolicyHtml}
          <p style="margin:12px 0">
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

// --- ClickSend SMS alert (owner notification) ---
try {
  if (
    process.env.CLICKSEND_USERNAME &&
    process.env.CLICKSEND_API_KEY &&
    process.env.ALERT_SMS_TO &&
    process.env.SMS_SENDER
  ) {
    // Build a short when-string for SMS
    const whenSms = new Date(startISO).toLocaleString('en-GB', {
      timeZone: TZ,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Compose the SMS body
    const bodyText = `New booking: ${summary || 'Service'} with ${barberName || 'Ian'} at ${whenSms}.`
      + (customerName ? ` Customer: ${customerName}.` : '')
      + (customerPhone ? ` Phone: ${customerPhone}.` : '');

    const payload = {
      messages: [
        {
          source: 'trimzi-app',
          body: bodyText,
          to: process.env.ALERT_SMS_TO,     // e.g. +447900473307
          from: process.env.SMS_SENDER,     // e.g. +447900473307 (verified in ClickSend)
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
  // Never fail the booking because SMS failed
  console.warn('ClickSend SMS failed:', e);
}

    return NextResponse.json({ ok: true, eventId: eventId, htmlLink: res.data.htmlLink });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}