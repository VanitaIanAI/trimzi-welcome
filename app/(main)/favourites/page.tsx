// app/(main)/favourites/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '../../../lib/firebaseClient';
import { collection, getDocs } from 'firebase/firestore';


export default function FavouritesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [salons, setSalons] = useState<Array<{ id: string; name: string; address?: string }>>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || user.isAnonymous) { setSalons([]); setLoading(false); return; }
      try {
        const col = collection(db, 'users', user.uid, 'favSalons');
        const res = await getDocs(col);
        const rows: Array<{ id: string; name: string; address?: string }> = [];
        res.forEach(d => rows.push({ id: d.id, ...(d.data() as any) }));
        if (!cancelled) setSalons(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="min-h-dvh bg-ivory pb-24">
      <main className="mx-auto max-w-[720px] px-4 pt-6 space-y-4">
        <h1 className="text-brown text-2xl font-semibold">Favourites</h1>

        {/* States */}
        {loading ? (
          <p className="text-brown/70">Loading…</p>
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
