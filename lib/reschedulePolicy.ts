// Pure rescheduling policy. No credentials, persistence, Calendar calls or notifications.
import { build15MinGrid } from '@lib/bookingSchedule';

export const RESERVATION_MS = 45 * 60_000;
export const CHANGE_NOTICE_MS = 24 * 60 * 60_000;
export const APPOINTMENT_TIME_ZONE = 'Europe/London';

// Midnight needs its own offset on clock-change days, rather than the noon offset.
export function ukMidnight(date: string): string {
  const utc = Date.parse(`${date}T00:00:00Z`);
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: APPOINTMENT_TIME_ZONE, timeZoneName: 'shortOffset',
  }).format(new Date(utc));
  const match = label.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  const offset = match ? Number(match[1]) * 60 + (match[1].startsWith('-') ? -1 : 1) * Number(match[2] || 0) : 0;
  return new Date(utc - offset * 60_000).toISOString();
}

export function canChangeAppointment(startISO: string, now: number): boolean {
  const start = Date.parse(startISO);
  return Number.isFinite(start) && Number.isFinite(now) && start - now > CHANGE_NOTICE_MS;
}

function londonOffset(date: string): number {
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: APPOINTMENT_TIME_ZONE, timeZoneName: 'shortOffset',
  }).format(new Date(`${date}T12:00:00Z`));
  const match = label.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1].startsWith('-') ? -1 : 1;
  return Number(match[1]) * 60 + sign * Number(match[2] || 0);
}

export function replacementWindow(date: unknown, time: unknown, now: number):
  { startISO: string; endISO: string } | null {
  if (typeof date !== 'string' || typeof time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) ||
      !build15MinGrid(date).includes(time) || !Number.isFinite(now)) return null;
  const start = Date.parse(`${date}T${time}:00Z`) - londonOffset(date) * 60_000;
  if (!Number.isFinite(start) || start <= now) return null;
  return { startISO: new Date(start).toISOString(), endISO: new Date(start + RESERVATION_MS).toISOString() };
}

export type CalendarAppointment = {
  status?: string | null;
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
};

export function originalWindow(event: CalendarAppointment): { startISO: string; endISO: string } | null {
  const startISO = event.start?.dateTime;
  const endISO = event.end?.dateTime;
  if (event.status === 'cancelled' || !startISO || !endISO) return null;
  const start = Date.parse(startISO), end = Date.parse(endISO);
  if (!Number.isFinite(start) || end - start !== RESERVATION_MS) return null;
  return { startISO: new Date(start).toISOString(), endISO: new Date(end).toISOString() };
}

export function intervalsOverlap(a: { startISO: string; endISO: string }, b: { startISO: string; endISO: string }): boolean {
  return Date.parse(a.startISO) < Date.parse(b.endISO) && Date.parse(b.startISO) < Date.parse(a.endISO);
}
