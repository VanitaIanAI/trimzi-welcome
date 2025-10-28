/* app/(main)/bookings/page.tsx */
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  type DocumentData,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from '../../../lib/firebaseClient'; // NOTE: 3x ".." from (main)/bookings

type Booking = {
  id: string;
  serviceName: string;
  barberName?: string | null;
  price?: number | null;
  startISO: string; // e.g. "2025-09-22T09:30:00.000Z"
  endISO?: string | null;
  htmlLink?: string | null;  // optional Google Calendar link
  createdAt?: any;
};

export default function BookingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Booking[]>([]);
  // add alongside: const [user], [authReady], [loading], [items], etc.
const [cancellingId, setCancellingId] = useState<string | null>(null);


  // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Subscribe to this user's bookings (if signed in and not anonymous)
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Structure expected: users/{uid}/bookings/{bookingId}
    // Order by startISO descending; cap to last 50 for now.
    const q = query(
      collection(db, 'users', user.uid, 'bookings'),
      orderBy('startISO', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Booking[] = snap.docs.map((d) => {
          const data = d.data() as DocumentData;
          return {
            id: d.id,
            serviceName: (data.serviceName ?? data.summary ?? 'Booking') as string,
            barberName: (data.barberName ?? null) as string | null,
            price: (typeof data.price === 'number' ? data.price : null) as number | null,
            startISO: (data.startISO ?? '') as string,
            endISO: (data.endISO ?? null) as string | null,
            htmlLink: (data.htmlLink ?? null) as string | null,
            createdAt: data.createdAt ?? null,
          };
        });
        setItems(rows);
        setLoading(false);
      },
      () => {
        setItems([]);
        setLoading(false);
      }
    );

    return unsub;
  }, [user?.uid]);

  // Split into upcoming vs past based on now
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: Booking[] = [];
    const pa: Booking[] = [];
    for (const b of items) {
      const startT = b.startISO ? Date.parse(b.startISO) : 0;
      (startT >= now ? up : pa).push(b);
    }
    return {
      upcoming: up.sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO)), // soonest first
      past: pa.sort((a, b) => Date.parse(b.startISO) - Date.parse(a.startISO)),     // most recent first
    };
  }, [items]);

  // Format helpers
  function fmtDateTime(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  }

  // Render
  return (
    <div className="min-h-dvh bg-ivory pb-24">
      <main className="mx-auto max-w-[720px] px-4 pt-4 space-y-6">
        <header className="mb-2">
          <h1 className="text-brown text-2xl font-bold">Your bookings</h1>
        </header>

        {/* Not signed in / guest */}
        {authReady && (!user || user.isAnonymous) && (
          <section className="rounded-xl bg-white border border-brown/10 p-5 text-center">
            <p className="text-brown/80 mb-4">
              Sign in to see your upcoming and past bookings.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center h-11 px-4 rounded-xl border border-brown/20 text-brown hover:bg-brown/5"
            >
              Go to sign in
            </Link>
          </section>
        )}

        {/* Loading state */}
        {authReady && user && !user.isAnonymous && loading && (
          <section className="rounded-xl bg-white border border-brown/10 p-5">
            <p className="text-brown/70 text-sm">Loading your bookings…</p>
          </section>
        )}

        {/* Upcoming */}
        {authReady && user && !user.isAnonymous && !loading && (
          <>
            <section className="rounded-xl bg-white border border-brown/10">
              <div className="px-4 py-3 border-b border-brown/10">
                <h2 className="text-brown font-semibold">Upcoming</h2>
              </div>

              {upcoming.length === 0 ? (
                <div className="px-4 py-5 text-brown/70 text-sm">
                  No upcoming bookings yet.
                </div>
              ) : (
                <ul className="divide-y divide-brown/10">
                  {upcoming.map((b) => (
                    <li key={b.id} className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-brown font-medium truncate">{b.serviceName}</p>
                        <p className="text-brown/70 text-sm mt-1">
                          {fmtDateTime(b.startISO)}
                          {b.barberName ? ` · ${b.barberName}` : ''}
                        </p>
                        {typeof b.price === 'number' && (
                          <p className="text-brown/70 text-sm mt-1">£{b.price}</p>
                        )}
                        {/*
                        {b.htmlLink && (
                          <p className="text-xs mt-2">
                            <a
                              href={b.htmlLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brown hover:underline"
                            >
                              View in calendar
                            </a>
                          </p>
                        )}
                        */}

                      </div>
                     <div className="flex flex-col items-end gap-2 shrink-0">
  {/* Rebook button – unchanged, but disabled while this booking is cancelling */}
  <Link
    href={{
      pathname: '/booking',
      query: {
        name: b.serviceName,
        price: typeof b.price === 'number' ? b.price : undefined,
        barber: b.barberName ?? 'Ian',
        durationMins: undefined,
      },
    }}
    aria-disabled={cancellingId === b.id}
    tabIndex={cancellingId === b.id ? -1 : 0}
    className={`text-sm px-3 py-1 rounded-md text-white hover:opacity-90
      ${cancellingId === b.id ? 'bg-brown/50 cursor-not-allowed' : 'bg-brown'}
    `}
  >
    Rebook
  </Link>

  {/* Cancel button – shows spinner + disables while cancelling */}
  <button
    disabled={cancellingId === b.id}
    className={`text-sm px-3 py-1 rounded-md border text-red-700
      ${cancellingId === b.id
        ? 'border-red-200 bg-red-50 cursor-not-allowed'
        : 'border-red-300 hover:bg-red-50'
      }`}
    onClick={async () => {
      try {
        if (!confirm('Cancel this appointment? This cannot be undone.')) return;

        setCancellingId(b.id);

        // use explicit eventId if available, else doc ID fallback
        const eventId =
          b.htmlLink?.match(/eventid=([^&]+)/i)?.[1] || b.id;

        const res = await fetch('/api/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          alert(json?.error || 'Cancellation failed. Please try again.');
          return;
        }

        // Also remove from the user's Firestore "bookings" list immediately
        // (the realtime listener will keep things consistent)
        try {
          const u = auth.currentUser;
          if (u && !u.isAnonymous) {
            const { doc, deleteDoc } = await import('firebase/firestore');
            await deleteDoc(doc(db, 'users', u.uid, 'bookings', b.id));
          }
        } catch (e) {
          console.warn('Local Firestore removal failed; listener will catch up:', e);
        }

        alert('Booking cancelled.');
      } catch (e) {
        console.error(e);
        alert('Error cancelling booking.');
      } finally {
        setCancellingId(null);
      }
    }}
  >
    {cancellingId === b.id ? (
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full border-2 border-red-300 border-t-red-600 animate-spin" />
        Cancelling…
      </span>
    ) : (
      'Cancel'
    )}
  </button>
</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Past */}
            <section className="rounded-xl bg-white border border-brown/10">
              <div className="px-4 py-3 border-b border-brown/10">
                <h2 className="text-brown font-semibold">Past</h2>
              </div>

              {past.length === 0 ? (
                <div className="px-4 py-5 text-brown/70 text-sm">
                  No past bookings to show.
                </div>
              ) : (
                <ul className="divide-y divide-brown/10">
                  {past.map((b) => (
                    <li key={b.id} className="p-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-brown font-medium truncate">{b.serviceName}</p>
                        <p className="text-brown/70 text-sm mt-1">
                          {fmtDateTime(b.startISO)}
                          {b.barberName ? ` · ${b.barberName}` : ''}
                        </p>
                        {typeof b.price === 'number' && (
                          <p className="text-brown/70 text-sm mt-1">£{b.price}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Link
  href={{
    pathname: '/booking',
    query: {
      name: b.serviceName,
      price: typeof b.price === 'number' ? b.price : undefined,
      barber: b.barberName ?? 'Ian', // 👈 same addition here
    },
  }}
  className="text-sm px-3 py-1 rounded-md border border-brown/20 text-brown hover:bg-brown/5"
>
  Rebook
</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}