// lib/availability.ts
import { getCalendar, CALENDAR_ID, TZ } from '@lib/googleCalendar';

export type BusyInterval = { start: Date; end: Date };

export function hhmm(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(date);
}

// Convert "HH:mm" on dateISO in Europe/London -> real UTC Date
function tzOffsetMinutesForDay(dateISO: string): number {
  // Probe at noon to avoid DST edges
  const probe = new Date(`${dateISO}T12:00:00Z`);
  // e.g. "13 GMT+1" in BST, or "12 GMT+0" in GMT
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    timeZoneName: 'shortOffset',
    hour12: false,
  }).format(probe);

  const m = s.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  return hours * 60 + minutes; // minutes east of UTC (BST = +60, GMT = 0)
}

export function toDateAt(dateISO: string, timeHHMM: string) {
  const [H, M] = timeHHMM.split(':').map(Number);
  const [y, mo, d] = dateISO.split('-').map(Number);

  // Europe/London wall-clock minutes for HH:mm
  const wallMinutes = H * 60 + M;

  // Offset for this specific day (handles BST/GMT correctly)
  const offset = tzOffsetMinutesForDay(dateISO);

  // Translate wall time -> UTC, then build Date in UTC
  const utcMinutes = wallMinutes - offset;
  const utcHour = Math.floor(utcMinutes / 60);
  const utcMin  = ((utcMinutes % 60) + 60) % 60;

  return new Date(Date.UTC(y, mo - 1, d, utcHour, utcMin, 0));
}

export function addMinutes(d: Date, mins: number) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + mins);
  return x;
}

export function overlaps(a: BusyInterval, b: BusyInterval) {
  return a.start < b.end && b.start < a.end;
}

// Use your existing windows: Wed–Fri 09:30–19:15, Sat 09:00–17:15
export function dayWindow(dateISO: string): { startLabel: string; endLabel: string } | null {
  const d = new Date(dateISO);
  const dow = d.getDay(); // Sun=0
  if (dow === 6)  return { startLabel: '09:00', endLabel: '17:15' };
  if (dow >= 3 && dow <= 5) return { startLabel: '09:30', endLabel: '19:15' };
  return null; // closed
}

export function build15MinGrid(dateISO: string) {
  const w = dayWindow(dateISO);
  if (!w) return [] as string[];

  const startMin = labelToMinutes(w.startLabel); // e.g. "09:30" -> 570
  const endMin   = labelToMinutes(w.endLabel);   // e.g. "19:15" -> 1155

  const slots: string[] = [];
  for (let m = startMin; m <= endMin; m += 15) {
    slots.push(minutesToLabel(m));
  }
  return slots;
}

// Busy intervals from Google Calendar for that day using FreeBusy API
export async function fetchBusyIntervals(dateISO: string): Promise<BusyInterval[]> {
  const startOfDay = toDateAt(dateISO, '00:00');
  const endOfDay   = toDateAt(dateISO, '23:59');

  const calendar = await getCalendar();

  const fb = await calendar.freebusy.query({
    requestBody: {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      timeZone: TZ,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busy: BusyInterval[] = [];
  const calBusy = fb.data.calendars?.[CALENDAR_ID]?.busy || [];
  for (const b of calBusy) {
    if (b.start && b.end) {
      busy.push({ start: new Date(b.start), end: new Date(b.end) });
    }
  }
  return busy;
}

// Convert a Date -> minutes since midnight *in Europe/London*
export function tzMinutes(d: Date) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  const [hh, mm] = s.split(':').map(Number);
  return hh * 60 + mm;
}

// Convert "HH:mm" -> minutes since midnight
export function labelToMinutes(label: string) {
  const [hh, mm] = label.split(':').map(Number);
  return hh * 60 + mm;
}

// Convert minutes-since-midnight -> "HH:mm"
export function minutesToLabel(mins: number) {
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}