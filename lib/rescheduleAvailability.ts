import { adminDb } from '@lib/firebaseAdmin';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
import { build15MinGrid } from '@lib/bookingSchedule';
import { intervalsOverlap, replacementWindow, ukMidnight } from '@lib/reschedulePolicy';

export async function rescheduleAvailability(date: string, barber: string, ownEventId: string, now: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !build15MinGrid(date).length) return [];
  const calendar = await getCalendar();
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  const nextDate = day.toISOString().slice(0, 10);
  const busy: {startISO: string; endISO: string}[] = [];
  let pageToken: string | undefined;
  do {
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID, timeMin: ukMidnight(date),
      timeMax: ukMidnight(nextDate),
      timeZone: 'Europe/London', singleEvents: true, showDeleted: false, maxResults: 2500, pageToken,
    }, {timeout: 15_000, retry: false});
    for (const event of response.data.items || []) {
      if (event.id === ownEventId || event.status === 'cancelled' || event.transparency === 'transparent') continue;
      const startISO = event.start?.dateTime || (event.start?.date ? ukMidnight(event.start.date) : null);
      const endISO = event.end?.dateTime || (event.end?.date ? ukMidnight(event.end.date) : null);
      // Fail closed if an ostensibly blocking event cannot be interpreted.
      if (!startISO || !endISO || !Number.isFinite(Date.parse(startISO)) || !Number.isFinite(Date.parse(endISO))) {
        throw new Error('Calendar availability could not be verified');
      }
      busy.push({startISO, endISO});
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  const holds = await adminDb.collection('holds').where('date', '==', date).where('barber', '==', barber).get();
  for (const doc of holds.docs) {
    const hold = doc.data();
    const expires = hold.expiresAt?.toMillis?.() ?? (hold.expiresAt instanceof Date ? hold.expiresAt.getTime() : Number(hold.expiresAt));
    if (expires > now) {
      if (!Number.isFinite(Date.parse(hold.startISO)) || !Number.isFinite(Date.parse(hold.endISO))) throw new Error('Hold availability could not be verified');
      busy.push({startISO: hold.startISO, endISO: hold.endISO});
    }
  }
  return build15MinGrid(date).filter(time => {
    const window = replacementWindow(date, time, now);
    return window && !busy.some(interval => intervalsOverlap(window, interval));
  });
}
