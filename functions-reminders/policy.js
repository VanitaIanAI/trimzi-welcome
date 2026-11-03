'use strict';
const {createHash} = require('node:crypto');
const HOUR = 3600000, DAY = 24 * HOUR;
const keyFor = (calendarId, eventId) => createHash('sha256').update(calendarId + '\n' + eventId).digest('hex');
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

function inspect(event, now) {
  const p = event?.extendedProperties?.private || {};
  if (p.trimziReminder !== 'v1' || event.status === 'cancelled' || !event.id || event.recurrence || event.recurringEventId) return null;
  const startISO = iso(event.start?.dateTime), endISO = iso(event.end?.dateTime);
  if (!startISO || !endISO || Date.parse(endISO) - Date.parse(startISO) !== 45 * 60000) return null;
  if (typeof p.reminderEmail !== 'string' || p.reminderEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.reminderEmail)) return null;
  const enrolledAt = Date.parse(p.reminderEnrolledAt);
  const actionAt = Date.parse(p.reminderScheduledAt);
  if (!Number.isFinite(enrolledAt) || enrolledAt > now || !Number.isFinite(actionAt) || actionAt < enrolledAt || actionAt > now) return null;
  if (typeof p.reminderRevision !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.reminderRevision)) return null;
  return {eventId: event.id, startISO, endISO, email: p.reminderEmail,
    uid: p.bookingOwnerUid || null, service: p.reminderService || 'TrimZi appointment', barber: p.reminderBarber || 'Ian',
    appRevision: p.reminderRevision, appStartISO: iso(p.reminderStartISO), actionAt, enrolledAt};
}

function nextSchedule(previous, event, now) {
  const current = inspect(event, now);
  if (!current) return null;
  const sameTime = previous?.schedule.startISO === current.startISO && previous?.schedule.endISO === current.endISO;
  const sameRevision = previous?.schedule.appRevision === current.appRevision;
  if (sameTime && sameRevision) return previous.schedule;
  // An observed manual move is dated conservatively at observation, never at generic Calendar.updated.
  const trustedAppMove = current.appStartISO === current.startISO && (!previous || !sameRevision);
  const changedAt = trustedAppMove ? current.actionAt : now;
  const dueAt = Date.parse(current.startISO) - DAY;
  return {...current, changedAt, dueAt, deadline: dueAt + HOUR,
    eligible: Date.parse(current.startISO) - changedAt > DAY, origin: trustedAppMove ? 'app' : 'observed-manual'};
}

function display(isoValue) {
  const d = new Date(isoValue);
  const day = d.toLocaleDateString('en-GB', {timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const time = d.toLocaleTimeString('en-GB', {timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  return `${day} at ${time}${Number(time.slice(0,2)) < 12 ? ' am' : ''}`;
}

function message(schedule, from) {
  const text = `Your TrimZi appointment is coming up.\n\n${schedule.service} with ${schedule.barber}\n${display(schedule.startISO)} (UK time)\n\nKelvin Hair, 116 Queen Margaret Drive, Glasgow G20 8NZ.\nNeed to contact Ian? Text 07900473307 or WhatsApp https://wa.me/447900473307\n${schedule.uid ? '\nView your booking: https://trimzi.co.uk/bookings\n' : ''}\nSee you soon!\nTrimZi`;
  // No original/expired cancellation token and no promise of online changes within 24h.
  return {from, to: schedule.email, subject: `Reminder: your TrimZi appointment — ${display(schedule.startISO)}`, text};
}
module.exports = {HOUR, DAY, keyFor, inspect, nextSchedule, display, message};
