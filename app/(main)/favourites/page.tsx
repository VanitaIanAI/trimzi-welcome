// app/(main)/favourites/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '../../../lib/firebaseClient';
import { collection, onSnapshot } from 'firebase/firestore';


export default function FavouritesPage() {
  const [user, setUser] = useState<User | null>(null);
const [authReady, setAuthReady] = useState(false);
const [loading, setLoading] = useState(true);
const [salons, setSalons] = useState<Array<{ id: string; name: string; address?: string }>>([]);

useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => {
    setUser(u ?? null);
    setAuthReady(true);
  });
  return unsub;
}, []);

  useEffect(() => {
  // Don’t show empty/signed-out states until auth is ready.
  if (!authReady) return;

  // Signed out or guest: show the signed-out message without flicker.
  if (!user || user.isAnonymous) {
    setSalons([]);
    setLoading(false);
    return;
  }

  // Signed-in: attach a real-time listener. Keep "loading" true until first snapshot arrives.
  setLoading(true);
  const colRef = collection(db, 'users', user.uid, 'favSalons');
  const unsub = onSnapshot(colRef, (snap) => {
    const rows: Array<{ id: string; name: string; address?: string }> = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
    setSalons(rows);
    setLoading(false);
  }, () => {
    // On error, still clear loading to avoid spinner forever; show empty safely.
    setSalons([]);
    setLoading(false);
  });

  return () => unsub();
}, [authReady, user?.uid, user?.isAnonymous]);

  return (
    <div className="min-h-dvh bg-ivory pb-24">
      <main className="mx-auto max-w-[720px] px-4 pt-6 space-y-4">
        <h1 className="text-brown text-2xl font-semibold">Favourites</h1>

        {/* States */}
{!authReady || loading ? (
  <section className="space-y-3" aria-busy="true" aria-live="polite">
    {[0, 1].map((i) => (
      <div
        key={i}
        className="rounded-xl border border-brown/10 bg-white p-4 flex items-center justify-between animate-pulse"
      >
        <div className="flex-1">
          <div className="h-4 w-40 bg-brown/10 rounded mb-2" />
          <div className="h-3 w-64 bg-brown/10 rounded" />
        </div>
        <div className="h-8 w-20 bg-brown/10 rounded-md" />
      </div>
    ))}
  </section>
) : !user || user.isAnonymous ? (
  <p className="text-brown/80">
    Sign in to save and view favourites.
  </p>
) : salons.length === 0 ? (
  <div className="rounded-xl border border-brown/10 bg-white p-4">
    <p className="text-brown/80">You haven’t saved any salons yet.</p>
    <div className="mt-3">
      <Link
        href="/kelvinhair"
        className="inline-block text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
      >
        Browse Kelvinhair
      </Link>
    </div>
  </div>
) : (
  <section className="space-y-3">
    {salons.map(s => (
      <div key={s.id} className="rounded-xl border border-brown/10 bg-white p-4 flex items-center justify-between">
        <div>
          <div className="text-brown font-medium">{s.name}</div>
          {s.address ? <div className="text-sm text-brown/70">{s.address}</div> : null}
        </div>
        <Link
          href="/kelvinhair"
          className="text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
        >
          Book
        </Link>
      </div>
    ))}
  </section>
)}


        <div className="mt-4">
          <Link
            href="/home"
            className="inline-block text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
          >
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
