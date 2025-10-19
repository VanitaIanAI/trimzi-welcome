import { NextResponse } from 'next/server';
import { adminDb } from '@lib/firebaseAdmin';
import { addMinutes, fetchBusyIntervals, overlaps, toDateAt } from '@lib/availability';

export const dynamic = 'force-dynamic';

// Create a 2-minute hold for [start, start+45m)
export async function POST(req: Request) {
  const { date, time, barber = 'Ian' } = await req.json();
  if (!date || !time) return NextResponse.json({ error: 'date and time required' }, { status: 400 });

  const start = toDateAt(date, time);
  const end45 = addMinutes(start, 45);
  const holdExpiresAt = addMinutes(new Date(), 2); // 2-minute hold

  const busy = await fetchBusyIntervals(date);

  // include active holds
  const holdsSnap = await adminDb.collection('holds')
    .where('date', '==', date)
    .where('barber', '==', barber)
    .get();

  const now = Date.now();
  for (const doc of holdsSnap.docs) {
    const h = doc.data() as any;
    const exp = h.expiresAt?.toMillis?.() ?? h.expiresAt;
    if (exp && exp > now) busy.push({ start: new Date(h.startISO), end: new Date(h.endISO) });
  }

  const conflict = busy.some(b => overlaps({ start, end: end45 }, b));
  if (conflict) {
    return NextResponse.json({ ok: false, reason: 'Slot no longer available' }, { status: 409 });
  }

  const holdId = `${barber}|${date}|${time}`;
  await adminDb.collection('holds').doc(holdId).set({
    holdId, barber, date, time,
    startISO: start.toISOString(),
    endISO: end45.toISOString(),
    createdAt: new Date(),
    expiresAt: holdExpiresAt,
  }, { merge: true });

  return NextResponse.json({ ok: true, holdId, expiresAt: holdExpiresAt.toISOString() });
}

// Release a hold manually (user cancels/leaves)
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const holdId = searchParams.get('holdId');
  if (!holdId) return NextResponse.json({ error: 'holdId required' }, { status: 400 });
  await adminDb.collection('holds').doc(holdId).delete();
  return NextResponse.json({ ok: true });
}