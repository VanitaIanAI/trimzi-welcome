'use client';

// app/kelvinhair/page.tsx
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '../../../lib/firebaseClient';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';



// one source of truth for your services (updated – 5 items)
const services = [
  { id: 'mens_scissor_cut',    name: "Men's - Scissor cut",          price: 22, durationMins: 45 },
  { id: 'mens_clipper_cut',    name: "Men's - Clipper cut / Fade",  price: 20, durationMins: 40 },
  { id: 'student_scissor_cut', name: 'Student - Scissor cut',        price: 18, durationMins: 45 },
  { id: 'student_clipper_cut', name: 'Student - Clipper cut / Fade', price: 16, durationMins: 40 },
  { id: 'boys_cut',            name: 'Boys cut (<14)',              price: 14, durationMins: 30 },
];

const featured = services.slice(0, 3);
const more = services.slice(3);

// salon identity used for favourites
const SALON_ID = 'kelvinhair';
const SALON_META = {
  name: 'Kelvinhair',
  address: '116 Queen Margaret Drive, Kelvinside, Glasgow G20 8NZ',
};

type InfoKind = 'scissor' | 'clipper' | null;

// Map service id -> info kind (we ignore boys_cut)
const infoKindByServiceId: Record<string, InfoKind> = {
  mens_scissor_cut: 'scissor',
  mens_clipper_cut: 'clipper',
  student_scissor_cut: 'scissor',
  student_clipper_cut: 'clipper',
  boys_cut: null,
};

// Copy for each modal
const INFO_COPY: Record<Exclude<InfoKind, null>, { title: string; body: string; subHead: string; subText: string }> = {
  scissor: {
    title: 'Scissor Cut',
    body:
      'Mostly scissors are used to shape and blend your hair for a more natural look, with some clipper work to tidy the edges.',
    subHead: 'Why prices differ',
    subText: 'Because the techniques and importantly time involved differ, some styles may cost more.',
  },
  clipper: {
    title: 'Clipper Cut',
    body:
      'This style uses clippers for the bulk of the work, with some scissor finishing to refine the look.',
    subHead: 'Why prices differ',
    subText: 'Because the techniques and importantly time involved differ, some styles may cost more.',
  },
};


function MoreOptions({ more }: { more: any[] }) {
  'use client';
  const [open, setOpen] = React.useState(false);

  return (
    <>
      {open && (
        <section className="mt-3 bg-white rounded-xl border border-brown/10 divide-y divide-brown/10">
          {more.map((svc) => (
            <Link
              key={svc.id}
              href={{
                pathname: '/booking',
                query: { name: svc.name, price: svc.price, durationMins: svc.durationMins },
              }}
              className="p-4 flex items-start justify-between gap-4 hover:bg-brown/5"
            >
              <div>
                <h3 className="text-brown font-medium">{svc.name}</h3>
                <p className="text-brown/70 text-sm mt-1">{svc.durationMins} mins</p>
              </div>
              <div className="text-right">
                <div className="text-brown font-semibold">£{svc.price}</div>
                <div className="mt-2 text-sm px-3 py-1 rounded-md bg-brown text-white hover:opacity-90">
                  Add
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* Button stays at the very bottom */}
      <div className="px-1">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          className="block w-full text-center border border-brown text-brown py-3 rounded-lg hover:bg-brown/5"
        >
          Full styling options
        </a>
      </div>
    </>
  );
}

export default function KelvinhairPage() {
  
  const [infoOpen, setInfoOpen] = React.useState<InfoKind>(null);

const [user, setUser] = React.useState<User | null>(null);
const [favLoading, setFavLoading] = React.useState(true);
const [isFaved, setIsFaved] = React.useState(false);

// watch auth
React.useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => setUser(u ?? null));
  return unsub;
}, []);

// load current fav state
React.useEffect(() => {
  let cancelled = false;
  async function load() {
    if (!user || user.isAnonymous) {
      if (!cancelled) { setIsFaved(false); setFavLoading(false); }
      return;
    }
    try {
      const ref = doc(db, 'users', user.uid, 'favSalons', SALON_ID);
      const snap = await getDoc(ref);
      if (!cancelled) setIsFaved(snap.exists());
    } finally {
      if (!cancelled) setFavLoading(false);
    }
  }
  load();
  return () => { cancelled = true; };
}, [user]);

async function toggleFavourite() {
  if (!user || user.isAnonymous) {
    alert('Sign in to save favourites.');
    return;
  }
  const ref = doc(db, 'users', user.uid, 'favSalons', SALON_ID);
  if (isFaved) {
    await deleteDoc(ref);
    setIsFaved(false);
  } else {
    await setDoc(ref, {
      ...SALON_META,
      addedAt: serverTimestamp(),
    }, { merge: true });
    setIsFaved(true);
  }
}



  return (
    <div className="min-h-dvh bg-ivory pb-24">
      {/* Top app bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-brown/10">
        <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center">
          <Link
            href="/home"
            aria-label="Back"
            className="mr-3 text-brown text-2xl leading-none"
          >
            {'\u276E'} 
          </Link>

          <h1 className="brand text-brown text-xl font-bold">TrimZi</h1>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 pt-4 space-y-6">
        {/* Hero image for Kelvinhair */}
        <div className="relative w-full rounded-2xl overflow-hidden shadow-card aspect-[16/9] bg-stone-200">
          <Image
            src="/images/kelvinhair-hero.jpg"
            alt="Kelvinhair barbershop interior"
            fill
            sizes="(max-width: 768px) 100vw, 720px"
            className="object-cover"
            priority
          />
        </div>

        {/* Header + Address (single line, clickable) */}
        <section className="bg-white rounded-xl border border-brown/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-brown">Kelvinhair</h2>
              <p className="mt-1 text-sm text-brown/80">
                <a
                  href="/maps/kelvinhair-map.png"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline focus:underline"
                >
                  116 Queen Margaret Drive, Kelvinside, Glasgow G20 8NZ
                </a>
              </p>
            </div>

 {/* right side: favourite toggle */}
  <div className="pt-1">
    <button
      type="button"
      onClick={toggleFavourite}
      disabled={favLoading}
      aria-pressed={isFaved}
      aria-label={isFaved ? 'Remove from favourites' : 'Save to favourites'}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition
        ${isFaved
          ? 'bg-brown text-ivory border-brown hover:bg-brown/90'
          : 'bg-white text-brown border-brown/20 hover:border-brown/40'}`}
    >
      {/* heart icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill={isFaved ? 'currentColor' : 'none'} aria-hidden="true">
        <path
          d="M12.1 20s-7.1-4.4-9.2-7.7C1 9.6 2.1 6.9 4.8 6.2c1.5-.4 3.1.1 4.2 1.2l.9.9.9-.9c1.1-1.1 2.7-1.6 4.2-1.2 2.7.7 3.8 3.4 1.9 6.1-2.1 3.3-9.2 7.7-9.2 7.7z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <span>{isFaved ? 'Saved' : 'Save'}</span>
    </button>
  </div>




          </div>
        </section>

        {/* Featured services (3 items) */}
        <section className="bg-white rounded-xl border border-brown/10 divide-y divide-brown/10">
          {featured.map((svc) => (
            <Link
              key={svc.id}
              href={{
                pathname: '/booking',
                query: { name: svc.name, price: svc.price, durationMins: svc.durationMins },
              }}
              className="p-4 flex items-start justify-between gap-4 hover:bg-brown/5"
            >
              <div>
                <div className="flex items-start gap-2">
  <h3 className="text-brown font-medium">{svc.name}</h3>
  {/* Light-blue info "i" icon — stops navigation and opens modal */}
  {infoKindByServiceId[svc.id] && (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault(); // prevent Link navigation
        e.stopPropagation();
        setInfoOpen(infoKindByServiceId[svc.id]);
      }}
      className="shrink-0 mt-[2px] text-sky-400 hover:text-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-300/50 rounded"
      aria-label={`More info about ${svc.name}`}
    >
      {/* simple "i" icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 10v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="7" r="1.25" fill="currentColor" />
      </svg>
    </button>
  )}
</div>

                <p className="text-brown/70 text-sm mt-1">{svc.durationMins} mins</p>
              </div>
              <div className="text-right">
                <div className="text-brown font-semibold">£{svc.price}</div>
                <div className="mt-2 text-sm px-3 py-1 rounded-md bg-brown text-white hover:opacity-90">
                  Add
                </div>
              </div>
            </Link>
          ))}
        </section>

        {more.length > 0 && (
  // make details a vertical flex container we can order its children in
  <details className="group flex flex-col">
  {/* Extra two items — appear BETWEEN the first 3 and the toggle */}
  <section className="order-1 hidden group-open:block mt-3 bg-white rounded-xl border border-brown/10 divide-y divide-brown/10">
    {more.map((svc) => (
      <Link
        key={svc.id}
        href={{
          pathname: '/booking',
          query: { name: svc.name, price: svc.price, durationMins: svc.durationMins },
        }}
        className="p-4 flex items-start justify-between gap-4 hover:bg-brown/5"
      >
        <div>
          <div className="flex items-start gap-2">
  <h3 className="text-brown font-medium">{svc.name}</h3>
  {/* Light-blue info "i" icon — stops navigation and opens modal */}
  {infoKindByServiceId[svc.id] && (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault(); // prevent Link navigation
        e.stopPropagation();
        setInfoOpen(infoKindByServiceId[svc.id]);
      }}
      className="shrink-0 mt-[2px] text-sky-400 hover:text-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-300/50 rounded"
      aria-label={`More info about ${svc.name}`}
    >
      {/* simple "i" icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 10v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="7" r="1.25" fill="currentColor" />
      </svg>
    </button>
  )}
</div>

          <p className="text-brown/70 text-sm mt-1">{svc.durationMins} mins</p>
        </div>
        <div className="text-right">
          <div className="text-brown font-semibold">£{svc.price}</div>
          <div className="mt-2 text-sm px-3 py-1 rounded-md bg-brown text-white hover:opacity-90">
            Add
          </div>
        </div>
      </Link>
    ))}
  </section>

  {/* Toggle stays visually at the bottom */}
  <summary
    className="order-2 list-none cursor-pointer select-none"
    aria-label="Toggle full styling options"
  >
    {/* collapsed label */}
    <span className="block w-full text-center border border-brown text-brown py-3 rounded-lg hover:bg-brown/5 group-open:hidden">
      Full styling options
    </span>
    {/* expanded label */}
    <span className="hidden w-full text-center border border-brown text-brown py-3 rounded-lg hover:bg-brown/5 group-open:block">
      Less options
    </span>
  </summary>
</details>

)}
        
{/* x — Shared info modal */}
{infoOpen && (
  <div
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    aria-modal="true"
    role="dialog"
  >
    {/* Backdrop — click anywhere to close */}
    <div
      className="absolute inset-0 bg-black/40"
      onClick={() => setInfoOpen(null)}
    />

    {/* Sheet / modal */}
    <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-brown/10 p-5 mx-auto">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-brown text-lg font-semibold">
          {INFO_COPY[infoOpen].title}
        </h2>
        <button
          type="button"
          onClick={() => setInfoOpen(null)}
          className="text-brown/60 hover:text-brown focus:outline-none focus:ring-2 focus:ring-brown/30 rounded p-1"
          aria-label="Close"
        >
          {/* close icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <p className="text-brown/80 text-sm mt-2">
        {INFO_COPY[infoOpen].body}
      </p>

      <div className="mt-4 border-t border-brown/10 pt-3">
        <div className="text-xs uppercase tracking-wide text-brown/60">{INFO_COPY[infoOpen].subHead}</div>
        <p className="text-brown/80 text-sm mt-1">
          {INFO_COPY[infoOpen].subText}
        </p>
      </div>
    </div>
  </div>
)}

      </main>
    </div>
  );
}
