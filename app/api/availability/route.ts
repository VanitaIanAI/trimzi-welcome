export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { adminDb } from '@lib/firebaseAdmin';
import { build15MinGrid, fetchBusyIntervals, tzMinutes, labelToMinutes } from '@lib/availability';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dateISO = searchParams.get('date');   // YYYY-MM-DD
  const barber  = searchParams.get('barber') || 'Ian';
  if (!dateISO) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

  const starts = build15MinGrid(dateISO);
  const busy = await fetchBusyIntervals(dateISO);

  // add active holds as busy
  const holdsSnap = await adminDb.collection('holds')
    .where('date', '==', dateISO)
    .where('barber', '==', barber)
    .get();

  const now = Date.now();
  for (const doc of holdsSnap.docs) {
  const h = doc.data() as any;

  // Firestore Timestamps can be Timestamp objects, numbers, or strings
  let exp: number | null = null;
  if (h.expiresAt?.toMillis) {
    exp = h.expiresAt.toMillis();
  } else if (typeof h.expiresAt === 'number') {
    exp = h.expiresAt;
  } else if (typeof h.expiresAt === 'string') {
    const parsed = Date.parse(h.expiresAt);
    exp = isNaN(parsed) ? null : parsed;
  }

  // Only count hold as active if it's still valid
  if (exp && exp > now) {
    busy.push({ start: new Date(h.startISO), end: new Date(h.endISO) });
  }
}

// Build busy minute ranges in Europe/London
const busyRanges: Array<[number, number]> = busy.map(b => [tzMinutes(b.start), tzMinutes(b.end)]);

const available: string[] = [];
const disabled: string[] = [];

for (const label of starts) {
  const startMin = labelToMinutes(label);   // HH:mm -> minutes in day
  const endMin   = startMin + 45;           // fixed 45-min duration

  const conflict = busyRanges.some(([bStart, bEnd]) => startMin < bEnd && bStart < endMin);
  (conflict ? disabled : available).push(label);
}

  return NextResponse.json({ date: dateISO, barber, available, disabled });
}