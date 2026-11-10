import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { normalizeUKMobile, trimmedContact } from '@lib/contactDetails';
import { dayWindow } from '@lib/bookingSchedule';
import { services } from '@lib/serviceCatalog';

const collection = 'https://firestore.googleapis.com/v1/projects/trimzi-studio-test/databases/studio-test/documents/waitlistRequests';
const timeWindows = ['morning', 'afternoon', 'evening'];
const invalid = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_TRIMZI_TEST_WAITLIST !== 'yes') {
    return invalid('Waiting list preview unavailable.', 404);
  }
  if (request.headers.get('x-trimzi-waitlist') !== 'test' ||
      request.headers.get('content-type')?.split(';', 1)[0] !== 'application/json') {
    return invalid('Invalid waiting list request.', 415);
  }
  const token = process.env.TRIMZI_TEST_WAITLIST_TOKEN;
  if (!token) return invalid('The test waiting list is offline.', 503);

  let raw;
  try {
    const text = await request.text();
    if (text.length > 2048) return invalid('The waiting list request is too large.', 413);
    raw = JSON.parse(text);
  } catch {
    return invalid('Invalid waiting list request.');
  }
  if (!raw || typeof raw !== 'object') return invalid('Invalid waiting list request.');
  const { date, serviceId, barber } = raw;
  const day = typeof date === 'string' ? new Date(date + 'T12:00:00Z') : null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', dateStyle: 'short' }).format(new Date());
  if (!day || !Number.isFinite(+day) || day.toISOString().slice(0, 10) !== date || date < today || !dayWindow(date)) {
    return invalid('Choose a valid opening date.');
  }
  if (barber !== 'Ian' || !services.some(service => service.id === serviceId)) return invalid('Choose a barber and service.');
  const name = trimmedContact(raw.name);
  const phone = normalizeUKMobile(raw.phone);
  if (!name || name.length > 100) return invalid('Enter your name.');
  if (!phone) return invalid('Enter a valid UK mobile number.');
  if (!Array.isArray(raw.preferences) || !raw.preferences.length || raw.preferences.length > timeWindows.length ||
      !raw.preferences.every((value: unknown) => typeof value === 'string' && timeWindows.includes(value))) {
    return invalid('Select at least one preferred time.');
  }

  const preferences = timeWindows.filter(window => raw.preferences.includes(window));
  const id = createHash('sha256').update(JSON.stringify([date, barber, serviceId, phone])).digest('hex');
  const fields = Object.fromEntries(Object.entries({ date, barber, serviceId, name, phone, status: 'waiting',
    createdAt: new Date().toISOString() }).map(([key, value]) => [key, { stringValue: value }]));
  try {
    const result = await fetch(collection + '?documentId=' + id, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { ...fields, preferences: { arrayValue: { values: preferences.map(stringValue => ({ stringValue })) } } } }),
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (result.ok || result.status === 409) return NextResponse.json({ ok: true });
  } catch { /* Retry uses the same record ID. */ }
  return invalid('Could not confirm your place on the test waiting list. Please try again.', 502);
}
