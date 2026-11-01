import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { adminDb } from '@lib/firebaseAdmin';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';

// Admin-only by the deployed default-deny rules. Shared by app Calendar mutations.
// This coordinates app requests; direct edits in Google/Treatwell remain external.
const gate = () => adminDb.collection('calendarCoordination').doc('primary');
export const operationRef = (id: string) => adminDb.collection('rescheduleOperations').doc(id);
const LEASE_MS = 120_000;
export const changeError = (message: string, status = 409) => Object.assign(new Error(message), { status, diaryStatus: status });

export function calendarStatus(error: any): number | undefined {
  for (const value of [error?.response?.status, error?.status, error?.code]) {
    if (/^[1-5]\d{2}$/.test(String(value))) return Number(value);
  }
}

export async function completeMove(id: string) {
  const ref = operationRef(id);
  await adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const op = snapshot.data();
    if (!op) throw changeError('Change record is missing. Please contact Ian.');
    const bookingRef = adminDb.doc(op.bookingPath);
    const booking = await tx.get(bookingRef);
    // Never recreate a deleted booking or overwrite a different booking reference.
    const matches = booking.exists && booking.data()?.eventId === op.eventId;
    if (matches) tx.update(bookingRef, {
      startISO: op.newStartISO, endISO: op.newEndISO, rescheduledAt: new Date(),
    });
    tx.update(ref, { state: matches ? 'complete' : 'contact', completedAt: new Date() });
    tx.set(gate(), { pendingOperationId: null }, { merge: true });
  });
}

async function recoverPending(id: string) {
  const ref = operationRef(id);
  const op = (await ref.get()).data();
  if (!op) throw changeError('A previous change needs checking. Please contact Ian.', 503);
  if (op.state !== 'prepared') {
    await gate().set({ pendingOperationId: null }, { merge: true });
    return;
  }
  // After an uncertain response, give the remote request time to settle before rereading.
  if (Date.now() - op.createdAtMs < 30_000) throw changeError('Checking a previous appointment change. Please try again shortly.', 503);
  const calendar = await getCalendar();
  let event;
  try {
    event = (await calendar.events.get({calendarId: CALENDAR_ID, eventId: op.eventId}, {timeout: 15_000, retry: false})).data;
  } catch (error) {
    if (![404, 410].includes(calendarStatus(error) || 0)) throw error;
  }
  if (event && event.status !== 'cancelled') {
    const start = Date.parse(event.start?.dateTime || '');
    const end = Date.parse(event.end?.dateTime || '');
    if (start === Date.parse(op.newStartISO) && end === Date.parse(op.newEndISO)) {
      await completeMove(id);
      return;
    }
    // A manual move is authoritative; don't roll it back or invent a replacement.
    if (start !== Date.parse(op.oldStartISO) || end !== Date.parse(op.oldEndISO)) {
      await adminDb.runTransaction(async tx => {
        tx.update(ref, {state: 'contact'});
        tx.set(gate(), {pendingOperationId: null}, {merge: true});
      });
      return;
    }
  }
  await adminDb.runTransaction(async tx => {
    tx.update(ref, {state: 'failed'});
    tx.set(gate(), {pendingOperationId: null}, {merge: true});
  });
}

export async function calendarMutation<T>(work: (assertOwnership: () => Promise<void>) => Promise<T>): Promise<T> {
  const token = randomUUID();
  let acquired = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let renewalFailed = false;
  try {
    await adminDb.runTransaction(async tx => {
      const snapshot = await tx.get(gate());
      const state = snapshot.data();
      if (state?.owner && state.expiresAtMs > Date.now()) {
        throw changeError('The diary is updating. Please try again in a moment.');
      }
      tx.set(gate(), {owner: token, expiresAtMs: Date.now() + LEASE_MS}, {merge: true});
    });
    acquired = true;
    heartbeat = setInterval(() => {
      void adminDb.runTransaction(async tx => {
        const current = (await tx.get(gate())).data();
        if (current?.owner !== token) throw new Error('Diary coordination lost');
        tx.update(gate(), {expiresAtMs: Date.now() + LEASE_MS});
      }).catch(() => { renewalFailed = true; });
    }, 15_000);
    const pending = (await gate().get()).data()?.pendingOperationId;
    if (pending) await recoverPending(pending);
    if (renewalFailed) throw changeError('Please try again shortly.', 503);
    return await work(async () => {
      const current = (await gate().get()).data();
      if (renewalFailed || current?.owner !== token || current.expiresAtMs <= Date.now()) {
        throw changeError('The diary update needs checking. Please try again shortly.', 503);
      }
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (acquired) await adminDb.runTransaction(async tx => {
      if ((await tx.get(gate())).data()?.owner === token) {
        tx.update(gate(), {owner: null, expiresAtMs: 0});
      }
    }).catch(() => { console.warn('[Diary change] Coordination lease will expire.'); });
  }
}

export async function withCalendarMutation(work: (assertOwnership: () => Promise<void>) => Promise<Response>): Promise<Response> {
  try { return await calendarMutation(work); }
  catch (error: any) {
    console.warn('[Diary change] Could not complete request:', {status: error?.status || 503});
    return NextResponse.json({ok: false, error: error?.status ? error.message : 'The diary could not be updated. Please try again shortly.'}, {status: error?.status || 503});
  }
}

export async function prepareMove(id: string, operation: Record<string, unknown>) {
  await adminDb.runTransaction(async tx => {
    tx.create(operationRef(id), {...operation, state: 'prepared', createdAtMs: Date.now()});
    tx.set(gate(), {pendingOperationId: id}, {merge: true});
  });
}

export async function rejectMove(id: string) {
  await adminDb.runTransaction(async tx => {
    tx.update(operationRef(id), {state: 'failed'});
    tx.set(gate(), {pendingOperationId: null}, {merge: true});
  });
}
