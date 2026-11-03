import { createHash, timingSafeEqual } from 'crypto';
import { adminDb } from '@lib/firebaseAdmin';
import { getCalendar, CALENDAR_ID } from '@lib/googleCalendar';

export const paymentHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const orderRef = (orderId: string) => adminDb.collection('squarePaymentOrders').doc(paymentHash(orderId));
export function validPaymentToken(token: unknown, expected: unknown) {
  if (typeof token !== 'string' || token.length > 128 || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(paymentHash(token), 'hex'), Buffer.from(expected, 'hex'));
}
export function expectedPrice(props: Record<string, string>) {
  const amount = Number(props.expectedAmountMinor);
  if (!Number.isSafeInteger(amount) || amount <= 0 || props.expectedCurrency !== 'GBP' || !props.paymentServiceName) throw new Error('Invalid saved payment expectation');
  return { amount, currency: 'GBP', serviceName: props.paymentServiceName };
}
const statusCode = (e: any) => Number(e?.response?.status || e?.code);

// New bookings require a server-saved Square order binding. Older bookings retain their existing path.
export async function processVerifiedPayment(payment: any, notedEventId: string | null) {
  const calendar = await getCalendar();
  let binding: any;
  if (typeof payment.order_id === 'string' && payment.order_id) {
    const snap = await orderRef(payment.order_id).get();
    if (snap.exists) binding = snap.data();
  }
  const eventId = binding?.eventId || notedEventId;
  if (!eventId) return 'ignored';
  let event: any;
  try { event = (await calendar.events.get({ calendarId: CALENDAR_ID, eventId })).data; }
  catch (e) { if ([404, 410].includes(statusCode(e))) return 'ignored'; throw e; }
  if (event?.status === 'cancelled') return 'ignored';
  let props = event?.extendedProperties?.private || {};
  if (!props.paymentValidation && !binding) return 'legacy';
  if (props.paymentValidation !== 'v1') return 'ignored';
  // A webhook can precede persistence of its order binding; let Square retry rather than trust its note.
  if (!binding) throw new Error('Payment order binding not ready');
  const expected = expectedPrice(props);
  if (binding.version !== 'v1' || binding.calendarId !== CALENDAR_ID || binding.eventId !== eventId ||
      binding.orderId !== payment.order_id || binding.amount !== expected.amount || binding.currency !== expected.currency ||
      payment.amount_money?.amount !== expected.amount || payment.amount_money?.currency !== expected.currency ||
      payment.location_id !== binding.locationId || !payment.id ||
      (notedEventId && notedEventId !== eventId)) {
    console.warn('[Square webhook] Payment expectation mismatch; no paid-state changes.');
    return 'ignored';
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    props = event.extendedProperties?.private || {};
    if (event.status === 'cancelled' || props.paymentValidation !== 'v1' ||
        props.expectedAmountMinor !== String(expected.amount) || props.expectedCurrency !== expected.currency ||
        (props.squarePaymentId && props.squarePaymentId !== payment.id) ||
        (props.paymentStatus && !['unpaid', 'paid'].includes(props.paymentStatus))) return 'ignored';
    if (!event.etag) throw new Error('Calendar version missing');
    let description = event.description || '';
    for (const [key, value] of [['Payment status', 'paid'], ['Payment method', 'Pay online']]) {
      const re = new RegExp(`^${key}\\s*:.*$`, 'gmi');
      description = re.test(description) ? description.replace(re, `${key}: ${value}`) : `${description}\n${key}: ${value}`;
    }
    if (!/Payment:\s*PAID/i.test(description)) description += '\n\nPayment: PAID online via Square.';
    try {
      await calendar.events.patch({calendarId: CALENDAR_ID, eventId, requestBody: {
        colorId: '10', description, extendedProperties: {private: {...props, paymentStatus: 'paid', paymentMethod: 'pay_now', squarePaymentId: payment.id, squarePaymentStatus: 'COMPLETED'}},
      }}, {headers: {'If-Match': event.etag}, retry: false, timeout: 15000});
      break;
    } catch (e) {
      if ([404, 410].includes(statusCode(e))) return 'ignored';
      if (statusCode(e) !== 412 || attempt === 2) throw e;
      event = (await calendar.events.get({calendarId: CALENDAR_ID, eventId})).data;
    }
  }
  // Only update this event's verified owner, and never recreate a cancelled/deleted profile booking.
  const ownerUid = props.bookingOwnerUid;
  if (ownerUid) {
    const snap = await adminDb.collection('users').doc(ownerUid).collection('bookings').where('eventId', '==', eventId).get();
    for (const doc of snap.docs) {
      await adminDb.runTransaction(async tx => {
        const current = await tx.get(doc.ref);
        if (current.exists && current.data()?.eventId === eventId) tx.update(doc.ref, {
          paymentStatus: 'paid', paymentMethod: 'pay_now', squarePaymentId: payment.id,
          squarePaymentStatus: 'COMPLETED', paymentUpdatedAt: new Date().toISOString(),
        });
      });
    }
  }
  return 'processed';
}
