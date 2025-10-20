'use client';
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
  const d = new Date(iso);
  
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
  const d = new Date(iso);
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
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function BookingContent() {
  const searchParams = useSearchParams();
  const serviceName = searchParams.get('name');
  const servicePrice = searchParams.get('price');
  const [selectedDate, setSelectedDate] = useState(toInputDate(new Date()));
  const dayIdx = useMemo(() => new Date(selectedDate).getDay(), [selectedDate]);
  const serviceDuration = searchParams.get('durationMins');
  const [barber, setBarber] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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

// --- Contact details modal state (for users without phone) ---
const [showContactModal, setShowContactModal] = useState(false);
const [contactName, setContactName] = useState('');
const [contactPhone, setContactPhone] = useState('');
const [savingContact, setSavingContact] = useState(false);


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
      return;
    }
    const barberParam = barber.charAt(0).toUpperCase() + barber.slice(1).toLowerCase();
    const res = await fetch(`/api/availability?date=${selectedDate}&barber=${encodeURIComponent(barberParam)}`);
    const json = await res.json();
    setAvailable(json.available || []);
  };

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

async function submitBookingWith(customerName: string, customerPhone: string) {
  setPending(true);
  try {
    // Build start/end ISO strings (your booking is always 45m – we keep your current derivation)
    if (!selectedTime) throw new Error('No time selected');
    const startISO = toISO(selectedDate, selectedTime);
    const end = new Date(startISO);
    end.setMinutes(end.getMinutes() + durationMins);
    const endISO = end.toISOString();

    // POST to your API route
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: serviceName ?? 'Trimzi Booking',
        description: `Booked via Trimzi — Barber: ${barber || 'Ian'}`,
        startISO,                     // server still enforces 45m
        attendeeEmail: null,
        barberName: barber || 'Ian',
        customerName,
        customerPhone,
        date: selectedDate,
        holdId: holdId || null,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || 'Booking failed');
    }

    // Save a copy to user’s bookings if signed in (your existing logic unchanged)
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
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn('Saved booking to Firestore failed:', e);
    }

    // Show your existing confirmation sheet
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
    alert(`Error: ${err.message ?? err}`);
  } finally {
    setPending(false);
  }
}



async function handleBook() {
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

  // We have a phone already – proceed immediately
  await submitBookingWith(existingName, existingPhone);
}



  return (
    <div className="min-h-dvh bg-ivory text-brown">
       {/* Top app bar */}
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-brown/10">
      <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center justify-between">
        <h1 className="brand text-brown text-xl font-bold">TrimZi</h1>
        <Link
          href="/kelvinhair"
          className="text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
        >
          Back
        </Link>
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
              
              <input
                lang="en-GB"
                type="date"
                value={selectedDate}
                min={toInputDate(new Date())} // today or next open day
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-md border border-brown/20 bg-white px-3 py-2 text-sm"
              />  
            </div>
            
            {!OPEN_DAYS.includes(new Date(selectedDate).getDay() as (typeof OPEN_DAYS)[number]) && (
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

        {/* Closed day message */}
        {!OPEN_DAYS.includes(dayIdx as any) ? (
          <p className="mt-6 text-brown/70 text-sm">No slots: we're closed on {weekdayLabel(selectedDate)}.</p>
        ) : (
          <>
        


        {/* Sections */}
        {(['Morning','Midday / Afternoon','Afternoon / Evening'] as const).map((section) => {
          const list = (sections as any)[section] as string[];
          if (!list?.length) return null;
          return (
            <section key={section} className="mt-6">
              <h3 className="mb-3 text-brown font-semibold">{section}</h3>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                {list.map((t) => {
  const active = selectedTime === t;
  const isValid = available.includes(t); // only these can fit a 45-min booking

  return (
    <button
      key={t}
      type="button"
      disabled={!isValid || pending}
      onClick={async () => {
        if (!isValid) return;

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
          setHoldExpiry(Date.parse(json.expiresAt)); // for a countdown if you want
        } catch (e) {
          console.error(e);
          alert('Could not reserve the slot. Please try again.');
          setSelectedTime(null);
        }
      }}
      className={`rounded-xl border px-3 py-2 text-sm transition
        ${!isValid
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
        No login needed to make a booking, but we need a contact name and number in case the barber needs to reach you.
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
            className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="07..."
          />
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          disabled={savingContact}
          className="flex-1 h-12 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90 disabled:opacity-60"
          onClick={async () => {
            const phone = contactPhone.trim();
            if (!phone) {
              alert('Please enter a contact number to continue.');
              return;
            }

            setSavingContact(true);
            try {
              const u = auth.currentUser;
              if (u) {
                // Save to profiles/{uid} (works for both guest and signed-in)
                await setDoc(
                  doc(db, 'profiles', u.uid),
                  { name: contactName.trim(), phone },
                  { merge: true }
                );
              }
              setShowContactModal(false);
              // Proceed with booking using these details
              await submitBookingWith(contactName.trim(), phone);
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

        {/* Continue */}
        <div className="mt-8">

          {holdExpiry && selectedTime ? (
  <p className="mt-2 text-xs text-brown/70">
    This time is reserved for ~2 minutes while you complete your booking.
  </p>
) : null}

          <button
            type="button"
            disabled={isDisabled}
            onClick={handleBook}
            className={`w-full rounded-2xl px-5 py-4 text-center font-semibold transition
              ${isDisabled
                ? 'bg-brown/20 text-brown/50 cursor-not-allowed'
                : 'bg-brown text-ivory hover:bg-brown/90'}`}
            
          >
            {pending ? 'Booking...' : 'Continue'}
          </button>
         
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

        {confirm!.htmlLink ? (
          <p className="pt-2 text-xs">
            <a
              href={confirm!.htmlLink ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brown hover:underline"
            >
              View in calendar
            </a>
          </p>
        ) : null}
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
