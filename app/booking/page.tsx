'use client';
export const dynamic = 'force-dynamic';

import React, { useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

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

  // Start time differs for Saturday
  const slots = useMemo(() => {
    const isSaturday = dayIdx === 6;
    const [sh, sm] = isSaturday ? [9, 0] : [9, 30];   // Sat 09:00, Wed-Fri 09:30
    const [eh, em] = isSaturday ? [17, 15] : [19, 15];                        // Sat 17:15, else 19:15
    return buildSlots(sh, sm, eh, em);
  }, [dayIdx]);

  const sections = useMemo(() => sectionize(slots), [slots]);

async function handleBook() {
  if (!selectedDate || !selectedTime) {
    alert('Please choose a date and a time first.');
    return;
  }

  setPending(true);
  try {
    // Build start/end ISO strings
    const startISO = toISO(selectedDate, selectedTime);
    const end = new Date(startISO);
    end.setMinutes(end.getMinutes() + durationMins);
    const endISO = end.toISOString();

    // POST to our API route
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: serviceName ?? 'Trimzi Booking',
        description: `Booked via Trimzi — Barber: ${barber || 'Ian'}`,
        startISO,
        endISO,
        attendeeEmail: null,  // add a real email later if you want
        barberName: barber || 'Ian',
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.message || 'Booking failed');
    }

    alert(`Booked! ${json.htmlLink ? 'Open in Google Calendar: ' + json.htmlLink : ''}`);
  } catch (err: any) {
    console.error(err);
    alert(`Error: ${err.message ?? err}`);
  } finally {
    setPending(false);
  }
}


  return (
    <div className="min-h-dvh bg-ivory text-brown">
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
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTime(t)}
                      className={`rounded-xl border px-3 py-2 text-sm transition
                        ${active
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


        {/* Continue */}
        <div className="mt-8">
          <button
            type="button"
            disabled={pending || !barber || !selectedTime || !OPEN_DAYS.includes(dayIdx as any)}
            onClick={handleBook}
            className={`w-full rounded-2xl px-5 py-4 text-center font-semibold transition
              ${pending || !barber || selectedTime || !OPEN_DAYS.includes(dayIdx as any)
                ? 'bg-brown text-ivory hover:bg-brown/90'
                : 'bg-brown/20 text-brown/50 cursor-not-allowed'}`}
            
          >
            {pending ? 'Booking...' : 'Continue'}
          </button>
         
        </div>
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
