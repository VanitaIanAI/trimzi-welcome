'use client';

import { useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '../../../lib/firebaseClient';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  limit,
} from 'firebase/firestore';
import Link from 'next/link';

type Profile = {
  name?: string;
  email?: string;
  phone?: string;
  preferredBarberId?: string | null;
  defaultServiceId?: string | null;
  notif?: {
    remindersEmail?: boolean;
    marketing?: boolean;
  };
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type Announcement = {
  title: string;
  body: string;
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  createdAt?: Timestamp;
};

export default function ProfilePage() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // render only after fields are set at least once
  const [profileReady, setProfileReady] = useState(false);
  // prevent first-paint flicker until client mounts
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // form state
  const [name, setName] = useState('');
  const [emailRO, setEmailRO] = useState(''); // read-only
  const [phone, setPhone] = useState('');
  const [remindersEmail, setRemindersEmail] = useState(true);
  const [marketing, setMarketing] = useState(false);

  // announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const nowTS = useMemo(() => Timestamp.fromDate(new Date()), []);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // load profile
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user || user.isAnonymous) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid));
        const data = (snap.exists() ? (snap.data() as Profile) : {}) as Profile;

        setName(data.name ?? (user.displayName ?? ''));
        setEmailRO(data.email ?? (user.email ?? ''));
        setPhone(data.phone ?? '');
        setRemindersEmail(data.notif?.remindersEmail ?? true);
        setMarketing(data.notif?.marketing ?? false);
      } catch {
        // swallow; form stays mostly blank apart from auth values
      } finally {
        if (!cancelled) {
          setProfileReady(true);   // ✅ fields are ready to show (even if from auth defaults)
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // load active announcements (optional; safe if none exist)
  useEffect(() => {
    let cancelled = false;
    async function loadFeed() {
      try {
        const coll = collection(db, 'announcements');
        // show newest first; filter by active window if provided
        const q = query(coll, orderBy('createdAt', 'desc'), limit(5));
        const res = await getDocs(q);
        const items: Announcement[] = [];
        res.forEach((d) => items.push(d.data() as Announcement));

        const active = items.filter((a) => {
          const startsOk = a.startsAt ? a.startsAt.toMillis() <= nowTS.toMillis() : true;
          const endsOk = a.endsAt ? a.endsAt.toMillis() >= nowTS.toMillis() : true;
          return startsOk && endsOk;
        });

        if (!cancelled) setAnnouncements(active);
      } catch {
        // ignore feed errors silently
      }
    }
    loadFeed();
    return () => {
      cancelled = true;
    };
  }, [nowTS]);

  const phoneMissing = authReady && user && !user.isAnonymous && (phone.trim() === '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || user.isAnonymous) return;

    setError(null);
    setSaved(false);

    // enforce phone requirement
    if (phone.trim() === '') {
      setError('Please add a phone number (required for bookings).');
      return;
    }

    setSaving(true);
    try {
      const ref = doc(db, 'profiles', user.uid);
      await setDoc(
        ref,
        {
          name: name.trim(),
          email: emailRO || user.email || '',
          phone: phone.trim(),
          notif: {
            remindersEmail,
            marketing,
          },
          updatedAt: serverTimestamp(),
        } as Profile,
        { merge: true }
      );
      setSaved(true);
    } catch (e) {
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Guests: show upgrade prompt (toolbar already hidden for guests)
  if (authReady && (!user || user.isAnonymous)) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-6">
        <h1 className="text-2xl font-semibold text-brown mb-3">Profile</h1>
        <div className="rounded-xl border border-brown/10 bg-white p-4">
          <p className="text-brown/80 mb-4">
            You’re browsing as a guest. Sign in to save your details, view bookings, and get email reminders.
          </p>
          <Link
            href="/onboarding"
            className="inline-block text-sm text-brown border border-brown px-3 py-2 rounded-md hover:bg-brown/5"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

    // Don’t render anything until the client is mounted, auth is known, and fields are populated at least once.
  if (!mounted || !authReady || !profileReady) {
    return null;
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-brown">Profile</h1>

    

            {/* Announcements (optional) – wait until profileReady to avoid layout shift */}
      {profileReady && announcements.length > 0 && (
        <section className="rounded-xl border border-brown/10 bg-white">

          <div className="px-4 py-3 border-b border-brown/10">
            <h2 className="text-brown font-medium">Announcements</h2>
          </div>
          <div className="divide-y divide-brown/10">
            {announcements.map((a, i) => (
              <div key={i} className="px-4 py-3">
                <div className="text-sm font-medium text-brown">{a.title}</div>
                <div className="text-sm text-brown/80 mt-1">{a.body}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Profile form */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-brown/10 bg-white p-4 space-y-4"
      >
        <div>
          <label className="block text-sm text-brown/80 mb-1">Full name</label>
          <input
            className="w-full rounded-xl border border-brown/20 px-3 h-11 bg-white/70"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm text-brown/80 mb-1">Email</label>
          <input
            className="w-full rounded-xl border border-brown/20 px-3 h-11 bg-brown/5"
            value={emailRO}
            readOnly
          />
          <p className="text-xs text-brown/60 mt-1">Email comes from your sign-in and can’t be edited here.</p>
        </div>

        <div>
          <label className="block text-sm text-brown/80 mb-1">Phone <span className="text-red-500">*</span></label>
          <input
            className="w-full rounded-xl border border-brown/20 px-3 h-11 bg-white/70"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+44 7…"
          />
          <p className="text-xs text-brown/60 mt-1">
            Required for bookings so your barber can contact you if needed.
          </p>
        </div>

        <div className="rounded-lg border border-brown/10 p-3">
          <div className="text-sm font-medium text-brown mb-2">Email notifications</div>
          <label className="flex items-center gap-2 text-sm text-brown/90">
            <input
              type="checkbox"
              checked={remindersEmail}
              onChange={(e) => setRemindersEmail(e.target.checked)}
            />
            Appointment reminders
          </label>
          <label className="flex items-center gap-2 text-sm text-brown/90 mt-2">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
            News & offers
          </label>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {saved && <div className="text-sm text-green-700">Saved.</div>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="h-11 rounded-xl px-4 bg-brown text-white font-semibold hover:bg-brown/90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          <Link
            href="/home"
            className="h-11 rounded-xl px-4 border border-brown/20 text-brown hover:bg-ivory/80 inline-flex items-center justify-center"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}