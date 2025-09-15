'use client';
import React, { useMemo, useState } from 'react';

// --- Config ---
const DAY_TABS = ['Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type DayKey = typeof DAY_TABS[number];

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

export default function BookingPage() {
  const [barber, setBarber] = useState<string>("");
  const [dayIdx, setDayIdx] = useState<number>(0); // 0 = Wednesday
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Start time differs for Saturday
  const slots = useMemo(() => {
    const isSaturday = dayIdx === 3;
    const [sh, sm] = isSaturday ? [9, 0] : [9, 30];   // Sat 09:00, Wed-Fri 09:30
    const [eh, em] = isSaturday ? [17, 15] : [19, 15];                        // Sat 17:15, else 19:15
    return buildSlots(sh, sm, eh, em);
  }, [dayIdx]);

  const sections = useMemo(() => sectionize(slots), [slots]);

  return (
    <div className="min-h-dvh bg-ivory text-brown">
      <main className="mx-auto max-w-[720px] px-4 pb-24">
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

        {/* Day tabs (English-only labels to avoid hydration issues) */}
        <nav className="mt-6 border-b border-brown/10">
          <ul className="flex gap-6">
            {DAY_TABS.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => setDayIdx(i)}
                  className={`pb-3 text-brown/70 hover:text-brown transition-colors ${
                    dayIdx === i ? 'border-b-2 border-brown text-brown font-medium' : ''
                  }`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

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

        {/* Continue */}
        <div className="mt-8">
          <button
            type="button"
            disabled={!barber || !selectedTime}
            className={`w-full rounded-2xl px-5 py-4 text-center font-semibold transition
              ${selectedTime
                ? 'bg-brown text-ivory hover:bg-brown/90'
                : 'bg-brown/20 text-brown/50 cursor-not-allowed'}`}
            onClick={() => alert(`Booked ${barber} on ${DAY_TABS[dayIdx]} at ${selectedTime}`)}
          >
            Continue
          </button>
         
        </div>
      </main>
    </div>
  );
}
