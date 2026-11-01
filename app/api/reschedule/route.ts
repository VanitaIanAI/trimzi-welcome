import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { adminDb } from '@lib/firebaseAdmin';
import { bookingIdentity } from '@lib/bookingIdentity';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';
import { calendarMutation, calendarStatus, changeError, completeMove, operationRef, prepareMove, rejectMove } from '@lib/calendarMutation';
import { canChangeAppointment, originalWindow, replacementWindow } from '@lib/reschedulePolicy';
import { rescheduleAvailability } from '@lib/rescheduleAvailability';
import { notifyReschedule } from '@lib/rescheduleNotifications';
import { validContactEmail } from '@lib/contactDetails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(id);

async function ownedBooking(uid: string, bookingId: unknown) {
  if (!validId(bookingId)) throw changeError('Invalid booking reference.', 400);
  const ref = adminDb.collection('users').doc(uid).collection('bookings').doc(bookingId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw changeError('This booking is no longer available.', 404);
  const booking = snapshot.data()!;
  if (!validId(booking.eventId)) return {reason: 'older'} as const;
  const calendar = await getCalendar();
  let event;
  try {
    event = (await calendar.events.get({calendarId: CALENDAR_ID, eventId: booking.eventId}, {timeout: 15_000, retry: false})).data;
  } catch (error) {
    if ([404, 410].includes(calendarStatus(error) || 0)) throw changeError('This appointment is no longer available. Please refresh your bookings.', 409);
    throw error;
  }
  const privateData = event.extendedProperties?.private || {};
  // A user-editable Firestore eventId is never proof of ownership.
  if (!privateData.bookingOwnerUid) return {reason: 'older'} as const;
  if (privateData.bookingOwnerUid !== uid) throw changeError('This booking cannot be changed from this account.', 403);
  const window = originalWindow(event);
  if (!window || !validContactEmail(privateData.confirmationEmail)) return {reason: 'contact'} as const;
  return {reason: null, ref, booking, event, window, calendar, privateData} as const;
}

function failure(error: any) {
  console.warn('[Reschedule] Request could not complete:', {status: error?.diaryStatus || 503});
  return json({ok: false, error: error?.diaryStatus ? error.message : 'We could not confirm the result. Please retry the same confirmation or contact Ian.'}, error?.diaryStatus || 503);
}

export async function GET(req: Request) {
  try {
    const uid = (await bookingIdentity(req))!;
    const params = new URL(req.url).searchParams;
    const owned = await ownedBooking(uid, params.get('bookingId'));
    if (owned.reason) return json({ok: true, eligible: false, reason: owned.reason});
    if (!canChangeAppointment(owned.window.startISO, Date.now())) return json({ok: true, eligible: false, reason: 'notice'});
    const date = params.get('date');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw changeError('Please select a valid date.', 400);
    const barber = owned.privateData.bookingBarber || 'Ian';
    const available = date ? (await rescheduleAvailability(date, barber, owned.event.id!, Date.now()))
      .filter(time => replacementWindow(date, time, Date.now())?.startISO !== owned.window.startISO) : undefined;
    return json({ok: true, eligible: true, startISO: owned.window.startISO, confirmationEmail: owned.privateData.confirmationEmail, available});
  } catch (error) { return failure(error); }
}

export async function POST(req: Request) {
  try {
    const uid = (await bookingIdentity(req))!;
    const {bookingId, date, time, expectedStartISO, requestId} = await req.json();
    if (!validId(bookingId) || typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) throw changeError('Invalid change request.', 400);
    const id = createHash('sha256').update(`${uid}:${requestId}`).digest('hex');
    const result = await calendarMutation(async assertOwnership => {
      const previous = (await operationRef(id).get()).data();
      if (previous) {
        if (previous.uid !== uid || previous.bookingId !== bookingId || previous.date !== date || previous.time !== time || previous.expectedStartISO !== expectedStartISO) throw changeError('This change request was already used.', 409);
        if (previous.state === 'complete') return {id, startISO: previous.newStartISO};
        if (previous.state === 'contact') throw changeError('The appointment needs checking. Please contact Ian before making another change.', 409);
        throw changeError('That change was not confirmed. Refresh your bookings before trying again.', 409);
      }
      const owned = await ownedBooking(uid, bookingId);
      if (owned.reason) throw changeError('Please contact Ian to change this appointment.', 409);
      if (!canChangeAppointment(owned.window.startISO, Date.now())) throw changeError('Your appointment is within 24 hours. Please contact Ian.', 409);
      if (expectedStartISO !== owned.window.startISO) throw changeError('Your appointment has changed. Refresh your bookings and try again.', 409);
      const target = replacementWindow(date, time, Date.now());
      if (!target || target.startISO === owned.window.startISO) throw changeError('Please choose a different available time.', 400);
      const barber = owned.privateData.bookingBarber || 'Ian';
      const available = await rescheduleAvailability(date, barber, owned.event.id!, Date.now());
      if (!available.includes(time)) throw changeError('That time is no longer available. Please choose another.');
      // Recheck the notice window after potentially slow availability requests.
      if (!canChangeAppointment(owned.window.startISO, Date.now()) || Date.parse(target.startISO) <= Date.now()) throw changeError('Please refresh the appointment times before continuing.');
      if (!owned.event.etag) throw changeError('We could not verify this appointment. Please try again.', 503);
      await assertOwnership();
      await prepareMove(id, {
        uid, bookingId, bookingPath: owned.ref.path, eventId: owned.event.id!, date, time, expectedStartISO,
        oldStartISO: owned.window.startISO, oldEndISO: owned.window.endISO,
        newStartISO: target.startISO, newEndISO: target.endISO,
        confirmationEmail: owned.privateData.confirmationEmail,
        customerName: owned.privateData.customerName || 'Customer',
        serviceName: owned.privateData.bookingService || 'TrimZi appointment', barber,
      });
      try {
        await assertOwnership();
        await owned.calendar.events.patch({
          calendarId: CALENDAR_ID, eventId: owned.event.id!, sendUpdates: 'none',
          requestBody: {start: {dateTime: target.startISO, timeZone: 'Europe/London'}, end: {dateTime: target.endISO, timeZone: 'Europe/London'}},
        }, {headers: {'If-Match': owned.event.etag}, timeout: 15_000, retry: false});
      } catch (error) {
        // A precondition/conflict rejection definitely did not move the event.
        if ([400, 403, 404, 409, 410, 412].includes(calendarStatus(error) || 0)) {
          await rejectMove(id);
          throw changeError('The appointment could not be changed. Please refresh your bookings.', 409);
        }
        // Leave a recoverable journal for timeout/network/unknown outcomes.
        throw changeError('We are checking whether the change completed. Please try the same confirmation again shortly, or contact Ian.', 503);
      }
      await assertOwnership();
      await completeMove(id);
      const completed = (await operationRef(id).get()).data();
      if (completed?.state !== 'complete') throw changeError('The appointment needs checking. Please contact Ian.', 409);
      return {id, startISO: target.startISO};
    });
    // Provider failures never undo a persisted change. The shared diary gate is released.
    const notificationsAccepted = await notifyReschedule(result.id);
    return json({ok: true, startISO: result.startISO, notificationsAccepted});
  } catch (error) { return failure(error); }
}
