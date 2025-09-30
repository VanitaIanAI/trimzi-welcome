/* app/home/page.tsx */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebaseClient';

export default function HomePage() {
  const [tab, setTab] = useState<'services' | 'salon'>('services');
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Load Firestore profile if signed in
  useEffect(() => {
    let cancelled = false;
    async function loadProfile(uid: string) {
      try {
        const snap = await getDoc(doc(db, 'profiles', uid));
        if (!cancelled) {
          const name = snap.exists() ? (snap.data() as any).name ?? null : null;
          setProfileName(name);
        }
      } catch {
        if (!cancelled) setProfileName(null);
      }
    }
    if (user?.uid) loadProfile(user.uid);
    else setProfileName(null);
    return () => { cancelled = true; };
  }, [user?.uid]);

  // Greeting text (name > displayName > email prefix)
  const greetingName =
    profileName ||
    user?.displayName ||
    (user?.email ? user.email.split('@')[0] : null);

  return (
    <div className="min-h-dvh bg-ivory pb-24">
      {/* Top app bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-brown/10">
        <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center justify-between">
          <span className="brand text-brown text-xl">TrimZi</span>

          <div className="flex items-center gap-3">
            {!authReady ? (
              <span className="text-sm text-brown/60">Checking...</span>
            ) : user && greetingName ? (
              <span className="text-sm text-brown/80">
                Welcome back, <strong>{greetingName}</strong>
              </span>
            ) : (
              <Link
                href="/onboarding"
                className="text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ---- MAIN CONTENT (hero + tabs + search) ---- */}
      <main className="mx-auto max-w-[720px] px-4 pt-4 space-y-6">
        {/* HERO */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-card aspect-[16/9] bg-brown/5">
          <Image
            src="/hero.jpg"
            alt="Premium grooming hero"
            fill
            className="object-cover"
            sizes="(max-width: 720px) 100vw, 720px"
            priority
          />
          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent text-white">
            <h2 className="text-xl font-semibold">Book 5★ services in seconds</h2>
            <p className="text-sm opacity-90">Premium grooming for men. Trusted pros.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab('services')}
            className={`px-3 py-1 rounded-full border ${
              tab === 'services'
                ? 'bg-brown text-white border-brown'
                : 'border-brown/30 text-brown'
            }`}
          >
            Services
          </button>
          <button
            onClick={() => setTab('salon')}
            className={`px-3 py-1 rounded-full border ${
              tab === 'salon'
                ? 'bg-brown text-white border-brown'
                : 'border-brown/30 text-brown'
            }`}
          >
            Salon
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-brown/80 text-sm mb-1">Search</label>
            <input
              className="w-full rounded-xl border border-brown/20 px-4 h-12 bg-white/70"
              placeholder={tab === 'services' ? 'Cut, beard, hot towel…' : 'Kelvin Hair…'}
            />
          </div>
          <div>
            <label className="block text-brown/80 text-sm mb-1">Location</label>
            <input
              className="w-full rounded-xl border border-brown/20 px-4 h-12 bg-white/70"
              placeholder="Postcode or area"
            />
          </div>
          <div>
            <label className="block text-brown/80 text-sm mb-1">Date</label>
            <input
              className="w-full rounded-xl border border-brown/20 px-4 h-12 bg-white/70"
              placeholder="dd/mm/yyyy"
            />
          </div>
          <Link href="/kelvinhair" className="block">
            <button className="w-full h-12 rounded-xl bg-brown text-white font-semibold">
              Search TrimZi
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}