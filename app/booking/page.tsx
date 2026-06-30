'use client';

// app/booking/page.tsx

export const dynamic = 'force-dynamic';

import React, { useMemo, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { auth, db } from '../../lib/firebaseClient';
import { setDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { customsearch } from 'googleapis/build/src/apis/customsearch';

// --- Config ---
const OPEN_DAYS = [3, 4, 5, 6] as const; // Wed(3)-Sat(6)

// Safari-safe: never rely on new Date("YYYY-MM-DD")
function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d); // local date at midnight
}


// --- Calendar modal helpers (Wed–Sat only) ---
function isoTodayUK(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addMonths(d: Date, delta: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + delta);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function isOpenDow(dow: number) {
  return OPEN_DAYS.includes(dow as any);
}

function buildOpenDatesForMonth(viewMonth: Date, minISO: string): string[] {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();

  const out: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(y, m, day);
    const iso = toInputDate(d);
    if (iso < minISO) continue;
    if (isOpenDow(d.getDay())) out.push(iso);
  }
  return out;
}


// Return next open date in YYYY-MM-DD (for <input type="date">)
function nextOpenISO(from = new Date()): string {
  const d = new Date(from);
  while (!OPEN_DAYS.includes(d.getDay() as (typeof OPEN_DAYS)[number])) {
    d.setDate(d.getDate() + 1);
  }
  return toInputDate(d);
}  
  //format yyy-mm-dd for the <input type="date">
  function toInputDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }


// UK display date dd-MM-yyyy (for labels/alerts)
function formatUK(iso: string): string {
    const d = isoToLocalDate(iso);

  
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
      ? "nd"
      :day % 10 === 3 && day !== 13
      ? "rd"
      : "th";

  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  const year = d.getFullYear();

  return `${weekday}, ${day}${suffix} ${month} ${year}`;
}

// Human weekday name for a given ISO date
function weekdayLabel(iso: string): 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | 'Monday' | 'Tuesday' {
    const d = isoToLocalDate(iso);

  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] as any;
}

const BARBERS = ['Ian'] as const;

// Build 15-min slot labels between a start and end (inclusive) like "09:30" -> "19:15"
function buildSlots(startHour: number, startMin: number, endHour: number, endMin: number) {
  const slots: string[] = [];
  const start = new Date();
  start.setHours(startHour, startMin, 0, 0);
  const end = new Date();
  end.setHours(endHour, endMin, 0, 0);
  const cur = new Date(start);
  while (cur <= end) {
    const hh = String(cur.getHours()).padStart(2, '0');
    const mm = String(cur.getMinutes()).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
    cur.setMinutes(cur.getMinutes() + 15);
  }
  return slots;
}

// Partition slot labels into Morning/Midday/Evening
function sectionize(slots: string[]) {
  const isBefore = (a: string, b: string) => a.localeCompare(b) < 0;
  return {
    Morning: slots.filter(s => isBefore(s, '12:00')),
    'Midday / Afternoon': slots.filter(s => !isBefore(s, '12:00') && isBefore(s, '16:00')),
    'Afternoon / Evening': slots.filter(s => !isBefore(s, '16:00')),
  };
}

// Build an ISO timestamp from "YYYY-MM-DD" + "HH:mm"
function toISO(dateStr: string, timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
    const d = isoToLocalDate(dateStr);

  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// --- UK "now" helpers and past-slot check ---
function nowUKDateAndTime() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const yyyy = get('year');
  const mm   = get('month');
  const dd   = get('day');
  const hh   = get('hour');
  const min  = get('minute');

  return {
    dateISO: `${yyyy}-${mm}-${dd}`,   // "YYYY-MM-DD" in UK local time
    timeHHMM: `${hh}:${min}`,         // "HH:mm" in UK local time
  };
}

function isSlotInPast(dateISO: string, timeHHMM: string) {
  const { dateISO: todayUK, timeHHMM: nowUK } = nowUKDateAndTime();

  if (dateISO < todayUK) return true;                  // any past day
  if (dateISO > todayUK) return false;                 // any future day
  // same day: compare HH:mm lexicographically
  return timeHHMM < nowUK;
}


// --- Phone helpers (UK mobile) ---
// Accepts "07XXXXXXXXX" or "+447XXXXXXXXX". Returns normalized E.164 ("+44XXXXXXXXXX") if valid, else null.
function normalizeUKMobile(raw: string): string | null {
  const p = raw.replace(/[^\d+]/g, ''); // keep digits and a single leading +
  // +44 7XXXXXXXXX
  if (/^\+447\d{9}$/.test(p)) return p;
  // 07XXXXXXXXX  -> +44XXXXXXXXXX
  if (/^07\d{9}$/.test(p)) return p.replace(/^0/, '+44');
  return null;
}

// Looser check for instant feedback (allows spaces/dashes)
function looksLikeUKMobile(raw: string): boolean {
  const p = raw.replace(/[^\d+]/g, '');
  return /^\+447\d{9}$/.test(p) || /^07\d{9}$/.test(p);
}


function BookingContent() {
  const searchParams = useSearchParams();
  const serviceName = searchParams.get('name');
  const servicePrice = searchParams.get('price');
  // Prefill barber if coming from "Rebook"
const barberParam = searchParams.get('barber');

  const [selectedDate, setSelectedDate] = useState(nextOpenISO(new Date()));
  const dayIdx = useMemo(() => isoToLocalDate(selectedDate).getDay(), [selectedDate]);

  const serviceDuration = searchParams.get('durationMins');
  const [barber, setBarber] = useState<string>("");

 // Track which payment option this booking attempt is using
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState<'pay_now' | 'pay_later' | null>(null);

  // Auto-select barber from query param (if valid)
useEffect(() => {
  if (barberParam && BARBERS.includes(barberParam as any)) {
    setBarber(barberParam);
  }
}, [barberParam]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [redirectingToPayment, setRedirectingToPayment] = useState(false);
  const durationMins = Number(serviceDuration ?? 30); //fallback if query param missing
  const isDisabled = pending || !barber || !selectedTime || !OPEN_DAYS.includes(dayIdx as any);
  const router = useRouter();

const [showConfirm, setShowConfirm] = useState(false);
const [confirm, setConfirm] = useState<{
  service: string;
  dateLabel: string;
  timeLabel: string;
  barber: string;
  htmlLink?: string | null;
} | null>(null);

// availability + hold state
const [available, setAvailable] = useState<string[]>([]);
const [holdId, setHoldId] = useState<string | null>(null);
const [holdExpiry,setHoldExpiry] = useState<number | null>(null);
const [loadingAvail, setLoadingAvail] = useState(false);
const [showAllSlots, setShowAllSlots] = useState(false);

// --- Calendar modal state (Wed–Sat only) ---
const [showCalendarModal, setShowCalendarModal] = useState(false);
const [viewMonth, setViewMonth] = useState(() => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
});

// dateISO -> 'open' | 'full' | 'loading'
const [dayStatus, setDayStatus] = useState<Record<string, 'open' | 'full' | 'loading'>>({});

// True while any visible day is still loading
const isCalendarLoading = Object.values(dayStatus).some(
  (v) => v === 'loading'
);

// --- Contact details modal state (for users without phone) ---
const [showContactModal, setShowContactModal] = useState(false);
const [contactName, setContactName] = useState('');
const [contactPhone, setContactPhone] = useState('');
const [contactEmail, setContactEmail] = useState('');
const [savingContact, setSavingContact] = useState(false);

// --- Optional "note to barber" modal state ---
const [showNoteModal, setShowNoteModal] = useState(false);
const [noteText, setNoteText] = useState('');
const NOTE_MAX = 300;

// --- Add-to-calendar helpers ---
function isoToGCal(iso: string) {
  // 2025-10-22T15:00:00.000Z -> 20251022T150000Z
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildCalendarLinks(opts: {
  service: string;
  barber: string;
  dateISO: string;     // "YYYY-MM-DD"
  timeHHMM: string;    // "HH:mm"
  durationMins: number;
  note?: string;
}) {
  const { service, barber, dateISO, timeHHMM, durationMins, note = '' } = opts;

  // reuse your existing helpers
  const startISO = toISO(dateISO, timeHHMM);
  const end = new Date(startISO);
  end.setMinutes(end.getMinutes() + durationMins);
  const endISO = end.toISOString();

  const startG = isoToGCal(startISO);
  const endG   = isoToGCal(endISO);

  const title   = service ? `${service} — ${barber}` : 'Trimzi Booking';
  const details = `Booked via Trimzi — Barber: ${barber}${note ? `\n\nNote: ${note}` : ''}`;
  // same address you show on the Kelvinhair page
  const location = '116 Queen Margaret Drive, Kelvinside, Glasgow G20 8NZ';

  // Google Calendar link
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startG}/${endG}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;

  // Simple ICS (data URI)
  const uid = `trimzi-${startG}`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TrimZi//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${startG}`,
    `DTSTART:${startG}`,
    `DTEND:${endG}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details.replace(/\n/g, '\\n')}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  return { gcalUrl, icsHref };
}


// we’ll stash the name/phone/payment we’re going to submit with, then ask for the note
const [pendingContact, setPendingContact] = useState<{
  name: string;
  phone: string;
  email?: string;
  paymentMethod: 'pay_now' | 'pay_later';
} | null>(null);

  // Start time differs for Saturday
  const slots = useMemo(() => {
    const isSaturday = dayIdx === 6;
    const [sh, sm] = isSaturday ? [9, 0] : [9, 30];   // Sat 09:00, Wed-Fri 09:30
    const [eh, em] = isSaturday ? [17, 15] : [19, 15];                        // Sat 17:15, else 19:15
    return buildSlots(sh, sm, eh, em);
  }, [dayIdx]);

  const sections = useMemo(() => sectionize(slots), [slots]);

// 🆕 Fetch availability & manage holds when date/barber changes
useEffect(() => {
  // If user changes date/barber, clear current selection and release any hold
  setSelectedTime(null);

  const release = async () => {
    if (holdId) {
      try {
        await fetch(`/api/holds?holdId=${encodeURIComponent(holdId)}`, { method: 'DELETE' });
      } catch {}
      setHoldId(null);
      setHoldExpiry(null);
    }
  };

 const fetchAvail = async () => {
  if (!OPEN_DAYS.includes(dayIdx as any) || !barber) {
    setAvailable([]);
    setLoadingAvail(false);
    return;
  }
  setLoadingAvail(true);
  try {
    const barberParam = barber.charAt(0).toUpperCase() + barber.slice(1).toLowerCase();
    const res = await fetch(`/api/availability?date=${selectedDate}&barber=${encodeURIComponent(barberParam)}`);
    const json = await res.json();
    setAvailable(json.available || []);
  } catch (e) {
    console.error('Fetch availability failed:', e);
    setAvailable([]);
  } finally {
    setLoadingAvail(false);
  }
};



{/* Show loader while we fetch availability */}
{loadingAvail && OPEN_DAYS.includes(dayIdx as any) && barber && (
  <div className="mt-6 rounded-2xl bg-white border border-brown/10 p-4 flex items-center gap-3">
    <div className="h-5 w-5 rounded-full border-2 border-brown/20 border-t-brown animate-spin" />
    <p className="text-sm text-brown">Checking available times…</p>
  </div>
)}

  release().finally(fetchAvail);
}, [selectedDate, barber, dayIdx]); // re-run whenever these change

useEffect(() => {
  // cleanup when component unmounts or holdId changes next time
  return () => {
    if (holdId) {
      fetch(`/api/holds?holdId=${encodeURIComponent(holdId)}`, { method: 'DELETE' }).catch(() => {});
    }
  };
}, [holdId]);

// Prefetch which Wed–Sat dates are fully booked for the visible month (uses existing /api/availability)
useEffect(() => {
  if (!showCalendarModal) return;

  const minISO = isoTodayUK();
  const barberForCalendar = barber ? barber : 'Ian';
  const openDates = buildOpenDatesForMonth(viewMonth, minISO);

  // mark as loading first
  setDayStatus(prev => {
    const next = { ...prev };
    for (const iso of openDates) next[iso] = 'loading';
    return next;
  });

  let cancelled = false;

  (async () => {
    try {
      const results = await Promise.all(
        openDates.map(async (iso) => {
          try {
            const res = await fetch(
              `/api/availability?date=${encodeURIComponent(iso)}&barber=${encodeURIComponent(barberForCalendar)}`
            );
            const json = await res.json();
            const avail = Array.isArray(json?.available) ? json.available : [];
            return [iso, (avail.length > 0 ? 'open' : 'full')] as const;
          } catch {
            // If something fails, don't block selection; treat as open (conservative)
            return [iso, 'open'] as const;
          }
        })
      );

      if (cancelled) return;

      setDayStatus(prev => {
        const next = { ...prev };
        for (const [iso, status] of results) next[iso] = status;
        return next;
      });
    } catch {
      // ignore
    }
  })();

  return () => {
    cancelled = true;
  };
}, [showCalendarModal, viewMonth, barber]);


  const randId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  
async function getCustomerDetails() {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) {
    return { customerName: '', customerPhone: '' };
  }

  // name: prefer displayName, else profile.name
  let customerName = u.displayName || '';

  // phone from profiles/{uid}.phone
  let customerPhone = '';
  try {
    const snap = await getDoc(doc(db, 'profiles', u.uid));
    if (snap.exists()) {
      const p = snap.data() as any;
      if (!customerName) customerName = (p.name || '').trim();
      customerPhone = (p.phone || '').trim();
    }
  } catch {
    // ignore read errors; fall back to blanks
  }

  return { customerName, customerPhone };
}

async function submitBookingWith(
  customerName: string,
  customerPhone: string,
  note: string = '',
  attendeeEmailOverride?: string | null,
  paymentMethod: 'pay_now' | 'pay_later' = 'pay_later'
) {
  
  setPending(true);
  setRedirectingToPayment(false);
  try {
    // Build start/end ISO strings (your booking is always 45m – we keep your current derivation)
    if (!selectedTime) throw new Error('No time selected');
    const startISO = toISO(selectedDate, selectedTime);
    const end = new Date(startISO);
    end.setMinutes(end.getMinutes() + durationMins);
    const endISO = end.toISOString();

        // For now both options are effectively "unpaid" – when Square is added,
    // pay_now bookings will move to "paid".
    const initialPaymentStatus: 'unpaid' | 'paid' | 'partially_paid' = 'unpaid';

// Determine attendee email from the current user (only if not anonymous)
const uForEmail = auth.currentUser;
const attendeeEmail =
  uForEmail && !uForEmail.isAnonymous ? (uForEmail.email ?? null) : (attendeeEmailOverride ?? null);

    // POST to your API route
    // Call your existing booking API first
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: serviceName ?? 'Trimzi Booking',
        description: `Booked via Trimzi — Barber: ${barber || 'Ian'}`,
        startISO, // server still enforces 45m
        attendeeEmail,
        barberName: barber || 'Ian',
        customerName,
        customerPhone,
        date: selectedDate,
        holdId: holdId || null,
        noteText: note,
        // metadata only, for future Square/refund logic
        paymentMethod,
        paymentStatus: initialPaymentStatus,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || 'Booking failed');
    }

    const eventId: string | null =
      typeof json.eventId === 'string' ? json.eventId : null;

    // Save a copy to user’s bookings if signed in (unchanged from before)
    try {
      const u = auth.currentUser;
      if (!u || u.isAnonymous) {
        console.warn('Guest booking: not saving to Firestore.');
      } else {
        const bookingId = json.bookingId ?? json.eventId ?? randId();
        await setDoc(
          doc(db, 'users', u.uid, 'bookings', bookingId),
          {
            userId: u.uid,
            serviceName: serviceName ?? 'Trimzi Booking',
            barberName: barber || 'Ian',
            startISO,
            endISO,
            durationMins,
            price: servicePrice ? Number(servicePrice) : null,
            source: 'web',
            status: 'upcoming',
            htmlLink: json.htmlLink ?? null,
            eventId: json.eventId ?? null,
            createdAt: serverTimestamp(),
            note: note ? note : null,
            // NEW: payment metadata (does not affect current flow)
            paymentMethod,
            paymentStatus: initialPaymentStatus,
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn('Saved booking to Firestore failed:', e);
    }

    // If this booking was "pay now" and we have a valid price, try to start Square checkout
    if (paymentMethod === 'pay_now') {
      let amountMinor: number | null = null;

      if (servicePrice && !Number.isNaN(Number(servicePrice))) {
        // Convert pounds to pence (e.g. "22" -> 2200)
        amountMinor = Math.round(Number(servicePrice) * 100);
      }

         if (!amountMinor) {
        console.warn('Missing or invalid servicePrice – falling back to pay in shop');
        setRedirectingToPayment(false);
        alert(
          'Your booking is confirmed, but we could not start the online payment. Please pay in the shop.'
        );
      } else {
        try {
            setRedirectingToPayment(true);
          const payRes = await fetch('/api/payments/create-payment-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: amountMinor,
              currency: 'GBP',
              eventId,
              serviceName: serviceName ?? 'Trimzi Booking',
            }),
          });

          const payJson = await payRes.json().catch(() => null);

          if (payRes.ok && payJson?.ok && typeof payJson.url === 'string') {
            // Redirect straight to the Square-hosted checkout page
            window.location.href = payJson.url as string;
            return; // important: do not show the in-app confirmation sheet as well
          } else {
            console.warn('Square payment link failed:', payJson);
            setRedirectingToPayment(false);
            alert(
              'Your booking is confirmed, but we could not start the online payment. Please pay in the shop.'
            );
          }
        } catch (e) {
          console.error('Square payment link error:', e);
          setRedirectingToPayment(false);
          alert(
            'Your booking is confirmed, but we could not start the online payment. Please pay in the shop.'
          );
        }
      }
    }

    // Normal / fallback path: show your existing confirmation sheet in the app
    setRedirectingToPayment(false);
    setConfirm({
      service: serviceName ?? 'Trimzi Booking',
      dateLabel: formatUK(selectedDate),
      timeLabel: selectedTime!,
      barber: barber || 'Ian',
      htmlLink: json.htmlLink ?? null,
    });
    setShowConfirm(true);

  } catch (err: any) {
    console.error(err);
    setRedirectingToPayment(false);
    alert(`Error: ${err.message ?? err}`);
  } finally {
    setPending(false);
  }
}



async function handleBook(selectedPaymentMethod: 'pay_now' | 'pay_later') {
  // remember which option this attempt is using, so the contact modal can pick it up
  setPendingPaymentMethod(selectedPaymentMethod);
  if (!selectedDate || !selectedTime) {
    alert('Please choose a date and a time first.');
    return;
  }

  // Before submitting, check if we have contact info
  const u = auth.currentUser;
  let existingName = '';
  let existingPhone = '';

  if (u && !u.isAnonymous) {
    // Try profile doc
    try {
      const snap = await getDoc(doc(db, 'profiles', u.uid));
      if (snap.exists()) {
        const p = snap.data() as any;
        existingName = (u.displayName || p?.name || '').trim();
        existingPhone = (p?.phone || '').trim();
      } else {
        existingName = (u.displayName || '').trim();
      }
    } catch {
      existingName = (u.displayName || '').trim();
    }
  } else {
    // Guest: no guaranteed name/phone
    existingName = '';
    existingPhone = '';
  }

  // If we don't have a phone, open modal and let them provide it
  if (!existingPhone) {
    setContactName(existingName || '');
    setContactPhone('');           // blank to prompt entry
    setShowContactModal(true);
    return; // wait for modal's "Save & continue"
  }

 // We have a phone already – ask for an optional note before submitting
  setPendingContact({
    name: existingName,
    phone: existingPhone,
    email: contactEmail,
    paymentMethod: selectedPaymentMethod,
  });
  setShowNoteModal(true);
  return;

}



  return (
    <div className="min-h-dvh bg-ivory text-brown">
       {/* Top app bar */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-brown/10">
      <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center">
        <Link
          href="/kelvinhair"
          aria-label="Back"
          className="mr-3 text-brown text-2xl leading-none"
        >
          {'\u276E'}
        </Link>

        <h1 className="brand text-brown text-xl font-bold">TrimZi</h1>
      </div>
    </header>

      
      <main className="mx-auto max-w-[720px] px-4 pb-24">
        {/* Selected service header */}
        {serviceName && (
          <section className="mt-4 rounded-xl bg-white border border-brown/10 p-4">
            <h1 className="text-lg font-semibold text-brown">{serviceName}</h1>
            <p className="text-brown/70 text-sm">
              {servicePrice ? <>£{servicePrice}</> : null}
            </p>
          </section>
        )}
        {/* Date picker */}
        <section className="mt-6 rounded-2x1 bg-brown/5 border border-brown/10 p-4">
          <label className="text-sm block">
            <span className="sr-only">Choose date</span>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-brown/60">Date</p>
                <p className="font-semibold text-brown">{formatUK(selectedDate)}
                </p>
              </div>
              
              <button
  type="button"
  onClick={() => {
    // ensure calendar opens on the currently selected month
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    setViewMonth(d);
    setShowCalendarModal(true);
  }}
  className="rounded-md border border-brown/20 bg-white px-3 py-2 text-sm"
>
  Select date
</button>
            </div>
            
            {!OPEN_DAYS.includes(isoToLocalDate(selectedDate).getDay() as (typeof OPEN_DAYS)[number]) && (

              <p className="mt-2 text-xs text-red-700">We're closed on this day. Please choose Wed-Sat.
              </p>
            )}
          </label>
        </section>
        {/* Barber card + selector */}
        <section className="mt-6 rounded-2xl bg-brown/5 border border-brown/10 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Simple avatar */}
              <div className="size-10 rounded-full bg-brown/10 flex items-center justify-center">
                <span className="text-brown/80 text-sm">👤</span>
              </div>
              <div className="leading-tight">
                <p className="text-xs text-brown/60">Barber</p>
                <p className="font-semibold">{barber}</p>
              </div>
            </div>

            <label className="text-sm">
              <span className="sr-only">Choose barber</span>
              <select
                value={barber}
                onChange={(e) => setBarber(e.target.value)}
                className="rounded-md border border-brown/20 bg-white px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select Barber
                </option>
                {BARBERS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

           {/* Toggle: Show all times vs only available */}
        {OPEN_DAYS.includes(dayIdx as any) && barber && (
          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowAllSlots(v => !v)}
              className="text-sm rounded-md px-3 py-1 border border-brown/20 text-brown hover:bg-brown/5"
            >
              {showAllSlots ? 'Show available only' : 'Show all times'}
            </button>
          </div>
        )}


        {/* Closed day message */}
        {!OPEN_DAYS.includes(dayIdx as any) ? (
          <p className="mt-6 text-brown/70 text-sm">No slots: we're closed on {weekdayLabel(selectedDate)}.</p>
        ) : (
          <>
        

          {/* Show loader while we fetch availability */}
{loadingAvail && OPEN_DAYS.includes(dayIdx as any) && barber && (
  <div className="mt-6 rounded-2xl bg-white border border-brown/10 p-4 flex items-center gap-3">
    <div className="h-5 w-5 rounded-full border-2 border-brown/20 border-t-brown animate-spin" />
    <p className="text-sm text-brown">Checking available times…</p>
  </div>
)}

         {/* Sections */}
        {(['Morning','Midday / Afternoon','Afternoon / Evening'] as const).map((section) => {
          const list = (sections as any)[section] as string[];
          if (!list?.length) return null;

          // Decide which times to display:
          // - Default: only show *available* and *not in the past*
          // - If toggle is ON (showAllSlots), show everything (disabled ones stay disabled)
          const displayList = showAllSlots
            ? list
            : list.filter((t) => available.includes(t) && !isSlotInPast(selectedDate, t));

          if (!displayList.length) return null;

          return (
            <section key={section} className="mt-6">
              <h3 className="mb-3 text-brown font-semibold">{section}</h3>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                {displayList.map((t) => {
                  const isPast = isSlotInPast(selectedDate, t);
                  const active = selectedTime === t;
                  const isValid = available.includes(t); // fits a 45-min booking

                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={!isValid || pending || isPast}
                      onClick={async () => {
                        if (!isValid || isPast) return;

                        // release previous hold (if any)
                        if (holdId) {
                          try { await fetch(`/api/holds?holdId=${encodeURIComponent(holdId)}`, { method: 'DELETE' }); } catch {}
                          setHoldId(null);
                          setHoldExpiry(null);
                        }

                        setSelectedTime(t);

                        try {
                          const res = await fetch('/api/holds', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ date: selectedDate, time: t, barber }),
                          });
                          const json = await res.json();
                          if (!res.ok || !json.ok) {
                            alert(json.reason || 'That slot just went unavailable.');
                            // refresh availability
                            const r2 = await fetch(`/api/availability?date=${selectedDate}&barber=${encodeURIComponent(barber)}`);
                            const j2 = await r2.json();
                            setAvailable(j2.available || []);
                            setSelectedTime(null);
                            return;
                          }
                          setHoldId(json.holdId);
                          setHoldExpiry(Date.parse(json.expiresAt));
                        } catch (e) {
                          console.error(e);
                          alert('Could not reserve the slot. Please try again.');
                          setSelectedTime(null);
                        }
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm transition
                        ${(!isValid || isPast)
                          ? 'bg-white border-brown/10 text-brown/30 cursor-not-allowed'
                          : active
                            ? 'bg-brown text-ivory border-brown'
                            : 'bg-white border-brown/20 text-brown hover:border-brown/40'
                        }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        </>
        )}

{/* Contact details required (if no phone on profile) */}
{showContactModal ? (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    {/* backdrop */}
    <div
      className="absolute inset-0 bg-black/40"
      onClick={() => setShowContactModal(false)}
    />
    {/* modal */}
    <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-brown/10 p-5 mx-auto">
      <h2 className="text-brown text-lg font-semibold mb-2">Contact details required</h2>
      <p className="text-brown/80 text-sm mb-4">
        No login needed to make a booking, but we need an email address to confirm your booking and contact name and number in case the barber needs to reach you.
      </p>

      <div className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Full name</label>
          <input
            className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Mobile number</label>
          <input
  type="tel"
  inputMode="tel"
 
  className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
  value={contactPhone}
  onChange={(e) => setContactPhone(e.target.value)}
  placeholder="+44 7XXXXXXXXX or 07XXXXXXXXX"
  aria-invalid={contactPhone ? !looksLikeUKMobile(contactPhone) : undefined}
/>
        </div>
        <div>
  <label className="block text-sm mb-1">Email address</label>
  <input
    type="email"
    className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
    value={contactEmail}
    onChange={(e) => setContactEmail(e.target.value)}
    placeholder="you@example.com"
    required
  />
</div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          disabled={savingContact}
          className="flex-1 h-12 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90 disabled:opacity-60"
          onClick={async () => {
  const normalized = normalizeUKMobile(contactPhone.trim());

  if (!normalized) {
    alert('Please enter a valid UK mobile number (07XXXXXXXXX or +447XXXXXXXXX).');
    return;
  }

  if (!contactEmail || !contactEmail.includes('@')) {
  alert('Please enter a valid email address.');
  return;
}

  setSavingContact(true);
  try {
    const u = auth.currentUser;
    if (u) {
      // Save normalized E.164 into profiles/{uid}
      await setDoc(
        doc(db, 'profiles', u.uid),
        { name: contactName.trim(), phone: normalized },
        { merge: true }
      );
    }
    setShowContactModal(false);

    // Decide which payment method this booking will use (fallback to 'pay_later' just in case)
    const method: 'pay_now' | 'pay_later' = pendingPaymentMethod ?? 'pay_later';

    // After we have contact details, ask for an optional note
    setPendingContact({
      name: contactName.trim(),
      phone: normalized,
      email: contactEmail.trim(),
      paymentMethod: method,
    });
    setShowNoteModal(true);
  } catch (e) {
    console.error(e);
    alert('Could not save contact details. Please try again.');
  } finally {
    setSavingContact(false);
  }
}}

        >
          {savingContact ? 'Saving...' : 'Save & continue'}
        </button>

        <button
          type="button"
          className="h-12 rounded-xl px-4 border border-brown/20 text-brown hover:bg-ivory/80"
          onClick={() => setShowContactModal(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
) : null}

{/* Optional Note to Barber modal */}
{showNoteModal && pendingContact ? (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    {/* backdrop */}
    <div
      className="absolute inset-0 bg-black/40"
         onClick={() => {
        // clicking backdrop = skip
        setShowNoteModal(false);
        submitBookingWith(
          pendingContact.name,
          pendingContact.phone,
          '',
          pendingContact.email || null,
          pendingContact.paymentMethod
        );
        setPendingContact(null);
      }}
    />
    {/* modal */}
    <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-brown/10 p-5 mx-auto">
      <h2 className="text-brown text-lg font-semibold mb-2">Any notes for your barber?</h2>
      <p className="text-brown/80 text-sm mb-3">
        Optional. Add anything helpful (e.g. “keep length on top”, “sensitive skin”, “re-style”).
      </p>

      <div>
        <textarea
          value={noteText}
          onChange={(e) => {
            const v = e.target.value.slice(0, NOTE_MAX);
            setNoteText(v);
          }}
          rows={4}
          className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
          placeholder="Type a short note (max 300 chars)…"
          autoFocus
        />
        <div className="mt-1 text-xs text-brown/60 text-right">
          {noteText.length}/{NOTE_MAX}
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          className="h-12 rounded-xl px-4 border border-brown/20 text-brown hover:bg-ivory/80 flex-1"
          onClick={() => {
            // skip note
            setShowNoteModal(false);
            submitBookingWith(
              pendingContact.name,
              pendingContact.phone,
              '',
              pendingContact.email || null,
              pendingContact.paymentMethod
            );
            setPendingContact(null);
            setNoteText('');
          }}
        >
          Skip
        </button>

        <button
          type="button"
          className="flex-1 h-12 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90"
          onClick={() => {
            setShowNoteModal(false);
            submitBookingWith(
              pendingContact.name,
              pendingContact.phone,
              noteText.trim(),
              pendingContact.email || null,
              pendingContact.paymentMethod
            );
            setPendingContact(null);
            setNoteText('');
          }}
        >
          Add note & continue
        </button>
      </div>
    </div>
  </div>
) : null}


        {/* Continue */}
        <div className="mt-8">

          {holdExpiry && selectedTime ? (
  <p className="mt-2 text-xs text-brown/70">
    This time is reserved for ~2 minutes while you complete your booking.
  </p>
) : null}

           {/* Primary: Book and pay now */}
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => handleBook('pay_now')}
            className={`w-full rounded-2xl px-5 py-4 text-center font-semibold transition
              ${isDisabled
                ? 'bg-brown/20 text-brown/50 cursor-not-allowed'
                : 'bg-brown text-ivory hover:bg-brown/90'}`}
          >
             {redirectingToPayment
              ? 'Redirecting to payment…'
              : pending
                ? 'Booking…'
                : 'Book and pay now'}
          </button>

          {/* Secondary: Book and pay in-store */}
<button
  type="button"
  disabled={isDisabled}
  onClick={() => handleBook('pay_later')}
  className={`mt-3 w-full rounded-2xl px-5 py-4 text-center font-semibold transition
    ${isDisabled
      ? 'bg-ivory text-brown/40 border border-brown/10 cursor-not-allowed'
      : 'bg-ivory text-brown border border-brown hover:bg-brown/5'}`}
>
  Book and pay in-store
</button>

 {redirectingToPayment && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-brown/70">
              <div className="h-4 w-4 rounded-full border-2 border-brown/20 border-t-brown animate-spin" />
              <span>Redirecting you to secure payment…</span>
            </div>
          )}

          {/* Cancellation policy copy */}
          <p className="mt-3 text-xs text-brown/70 text-center">
            If you cancel more than 24 hours before your appointment, any online payment can usually be refunded.
            Cancellations within 24 hours are <span className="font-semibold">not subject to automatic refund</span>{' '}
            and any refund will be at your barber&apos;s discretion.
          </p>

          <p className="mt-3 text-xs text-brown/60 text-center">
            By booking, you agree to our{' '}
            <Link href="/terms" className="underline hover:no-underline">
              Terms of Use
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline hover:no-underline">
              Privacy Policy
            </Link>
            .
          </p>


        </div>
        
        {showConfirm && confirm && (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    {/* backdrop */}
    <div
      className="absolute inset-0 bg-black/40"
      onClick={() => setShowConfirm(false)}
    />

    {/* sheet / modal */}
    <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-brown/10 p-5 mx-auto">
      <h2 className="text-brown text-lg font-semibold mb-1">
        Booking confirmed 🎉
      </h2>
      <p className="text-brown/80 text-sm mb-4">
        You’ll receive an email shortly with your booking details.
      </p>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-brown/70">Service</span>
          <span className="font-medium text-brown">{confirm!.service}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brown/70">Date</span>
          <span className="font-medium text-brown">{confirm!.dateLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brown/70">Time</span>
          <span className="font-medium text-brown">{confirm!.timeLabel}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brown/70">Barber</span>
          <span className="font-medium text-brown">{confirm!.barber}</span>
        </div>

        {/* Add to calendar (user’s own) */}
{(() => {
  // Protect against edge cases where state isn’t ready yet
  if (!confirm || !selectedTime) return null;

  const { gcalUrl, icsHref } = buildCalendarLinks({
    service: confirm.service,
    barber: confirm.barber || 'Ian',
    dateISO: selectedDate,          // "YYYY-MM-DD"
    timeHHMM: selectedTime,         // "HH:mm"
    durationMins,                   // you already have this
    note: noteText || '',           // include if you want to reflect an added note
  });

  return (
    <div className="pt-3 flex items-center gap-3">
      <a
        href={gcalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brown underline hover:no-underline"
      >
        Add to Google Calendar
      </a>
      <a
        href={icsHref}
        download="trimzi-booking.ics"
        className="text-xs text-brown/80 underline hover:no-underline"
      >
        Add to Calendar
      </a>
    </div>
  );
})()}
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          className="flex-1 h-12 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90"
          onClick={() => {
            setShowConfirm(false);
          
            router.push('/home');
          }}
        >
          Back to Home
        </button>

      
      </div>
    </div>
  </div>
)}

{/* Calendar Modal (Wed–Sat only) */}
{showCalendarModal && (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
    {/* backdrop */}
    <div
      className="absolute inset-0 bg-black/40"
      onClick={() => setShowCalendarModal(false)}
    />

    {/* modal */}
    <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-brown/10 p-5 mx-auto">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="px-3 py-2 rounded-md border border-brown/20 text-brown text-sm hover:bg-brown/5"
          onClick={() => setViewMonth(m => addMonths(m, -1))}
        >
          Prev
        </button>

        <div className="text-brown font-semibold">
          {monthLabel(viewMonth)}
        </div>

        <button
          type="button"
          className="px-3 py-2 rounded-md border border-brown/20 text-brown text-sm hover:bg-brown/5"
          onClick={() => setViewMonth(m => addMonths(m, 1))}
        >
          Next
        </button>
      </div>

      <p className="mt-3 text-xs text-brown/70">
        Select a day (Wed–Sat only). Fully booked days show a 🚫.
      </p>

      {/* Headers only for Wed–Sat */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-xs text-brown/60">
        <div className="text-center">Wed</div>
        <div className="text-center">Thu</div>
        <div className="text-center">Fri</div>
        <div className="text-center">Sat</div>
      </div>

      {/* Dates: we only render Wed–Sat dates, grouped into rows of 4 */}
      {/* Show spinner while loading full/open day status */}
{isCalendarLoading ? (
  <div className="mt-6 flex items-center justify-center">
    <div className="h-6 w-6 rounded-full border-2 border-brown/20 border-t-brown animate-spin" />
  </div>
) : (
  (() => {
    const minISO = isoTodayUK();
    const dates = buildOpenDatesForMonth(viewMonth, minISO);

    if (!dates.length) {
      return (
        <div className="mt-4 text-sm text-brown/70">
          No available Wed–Sat dates in this month.
        </div>
      );
    }

    // Build rows aligned to real weekdays (Wed–Sat columns), with blanks where needed
const y = viewMonth.getFullYear();
const m = viewMonth.getMonth();
const lastDay = new Date(y, m + 1, 0).getDate();

const rows: (string | null)[][] = [];
let row: (string | null)[] = [null, null, null, null]; // Wed, Thu, Fri, Sat

for (let day = 1; day <= lastDay; day++) {
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const iso = `${y}-${mm}-${dd}`;

  if (iso < minISO) continue;

  const dow = new Date(y, m, day).getDay(); // 0=Sun..6=Sat
  if (!isOpenDow(dow)) continue;

  const col = dow - 3; // Wed(3)->0 ... Sat(6)->3
  if (col >= 0 && col <= 3) row[col] = iso;

  // When we hit Saturday, we finish the week row
  if (dow === 6) {
    rows.push(row);
    row = [null, null, null, null];
  }
}

// Push last partial row (if it has any dates)
if (row.some(Boolean)) rows.push(row);

return (
  <div className="mt-3 space-y-2">
    {rows.map((r, idx) => (
      <div key={idx} className="grid grid-cols-4 gap-2">
        {r.map((iso, colIdx) => {
          if (!iso) return <div key={`blank-${idx}-${colIdx}`} />;

          const dayNum = Number(iso.slice(8, 10));
          const status = dayStatus[iso];
          const isFull = status === 'full';

          return (
            <button
              key={iso}
              type="button"
              disabled={isFull}
              onClick={() => {
                setSelectedDate(iso);
                setShowCalendarModal(false);
              }}
              className={`h-12 rounded-xl border text-sm transition flex items-center justify-center gap-1
                ${selectedDate === iso
                  ? 'bg-brown text-ivory border-brown'
                  : isFull
                    ? 'bg-white border-brown/10 text-brown/30 cursor-not-allowed'
                    : 'bg-white border-brown/20 text-brown hover:border-brown/40'
                }`}
            >
              <span>{dayNum}</span>
              {isFull ? <span aria-hidden>🚫</span> : null}
            </button>
          );
        })}
      </div>
    ))}
  </div>
);
  })()
)}


      <div className="mt-5 flex gap-3">
        <button
          type="button"
          className="flex-1 h-12 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90"
          onClick={() => setShowCalendarModal(false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}


      </main>
    </div>
  );
}
export default function BookingPage() {
  return (
    <Suspense fallback={
      <main className="mx-auto max-w-[720px] px-4 py-6">
        <p className="text-brown/70 text-sm">Loading..</p>
      </main>
    }>
      <BookingContent />
    </Suspense>
  );
}
