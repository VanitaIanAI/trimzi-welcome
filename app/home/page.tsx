'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import BottomNav from '../../components/BottomNav';
import { SearchIcon, MapPinIcon, CalendarIcon, ScissorsIcon, ShopIcon } from '../../components/Icon';

export default function HomePage() {
  const [tab, setTab] = useState<'services' | 'salon'>('services');

  return (
    <div className="min-h-dvh bg-ivory pb-24">
      {/* Top app bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-brown/10">
        <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center justify-between">
          <span className="brand text-brown text-xl">TrimZi</span>
          <Link
            href="/onboarding"
            className="text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 pt-4 space-y-6">
        {/* Hero card - larger height, full width */}
        <div className="relative w-full overflow-hidden rounded-2xl shadow-card h-[260px] sm:h-[320px]">
          <Image
            src="/hero.jpg"
            alt="Barbering services collage"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 720px"
            className="object-cover"
          />
          <div className="absolute bottom-3 left-4 text-white drop-shadow">
            <h2 className="text-2xl font-semibold">Book 5★ services in seconds</h2>
            <p className="text-sm opacity-90">Premium grooming for men. Trusted pros.</p>
          </div>
        </div>

        {/* Toggle */}
        <div className="rounded-xl bg-white/70 p-3 shadow-sm border border-brown/10">
          <div className="flex gap-2">
            <button
              onClick={() => setTab('services')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                tab === 'services' ? 'bg-brown text-white' : 'bg-white text-brown'
              }`}
            >
              <ScissorsIcon className="w-4 h-4" />
              Services
            </button>
            <button
              onClick={() => setTab('salon')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                tab === 'salon' ? 'bg-brown text-white' : 'bg-white text-brown'
              }`}
            >
              <ShopIcon className="w-4 h-4" />
              Salon
            </button>
          </div>

          {/* Search form */}
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-brown/70">Search</label>
            <div className="flex items-center gap-2 rounded-xl border border-brown/20 bg-white px-3 py-3">
              <SearchIcon className="w-4 h-4 text-brown/70" />
              <input
                placeholder="Cut, beard, hot towel…"
                className="w-full outline-none text-brown placeholder:text-brown/50 bg-transparent"
              />
            </div>

            <label className="block text-sm text-brown/70">Location</label>
            <div className="flex items-center gap-2 rounded-xl border border-brown/20 bg-white px-3 py-3">
              <MapPinIcon className="w-4 h-4 text-brown/70" />
              <input
                placeholder="Postcode or area"
                className="w-full outline-none text-brown placeholder:text-brown/50 bg-transparent"
              />
            </div>

            <label className="block text-sm text-brown/70">Date</label>
            <div className="flex items-center gap-2 rounded-xl border border-brown/20 bg-white px-3 py-3">
              <CalendarIcon className="w-4 h-4 text-brown/70" />
              <input
                placeholder="dd/mm/aaaa"
                className="w-full outline-none text-brown placeholder:text-brown/50 bg-transparent"
              />
            </div>

            <button className="w-full bg-brown text-white rounded-xl py-3 font-medium">
              Search TrimZi
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3 pb-4">
          <button className="rounded-xl border border-brown/15 bg-white py-4 font-medium text-brown">
            My bookings
          </button>
          <button className="rounded-xl border border-brown/15 bg-white py-4 font-medium text-brown">
            Nearby barbers
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
