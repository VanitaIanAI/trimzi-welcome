
'use client';
import Image from 'next/image';
import { SearchIcon, MapPinIcon, CalendarIcon, ScissorsIcon, ShopIcon } from '@/components/Icon';

export default function Welcome(){
  // This is just UI; wire up search later.
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2 text-brown font-semibold text-xl">TrimZi</div>
          <nav className="hidden md:flex items-center gap-6 text-muted">
            <a className="hover:text-charcoal" href="#">Hair</a>
            <a className="hover:text-charcoal" href="#">Beard</a>
            <a className="hover:text-charcoal" href="#">Face</a>
            <a className="hover:text-charcoal" href="#">Men's</a>
          </nav>
          <div className="flex items-center gap-3">
            <button className="btn btn-secondary">Sign in</button>
            <button className="btn btn-primary">Book now</button>
          </div>
        </div>
      </header>

      <section className="container grid md:grid-cols-[380px,1fr] gap-10 items-center py-10 md:py-16">
        {/* Left search panel */}
        <div className="card p-4 md:p-6">
          <div className="flex gap-2 text-sm font-semibold border-b border-border pb-3 mb-4">
            <div className="flex items-center gap-2 text-brown"><ScissorsIcon className="w-5 h-5"/> Services</div>
            <div className="flex items-center gap-2 text-muted"><ShopIcon className="w-5 h-5"/> Salon</div>
          </div>
          <div className="space-y-3">
            <label className="block">
              <div className="mb-1 text-sm text-muted">Search</div>
              <div className="input flex items-center gap-2"><SearchIcon className="w-5 h-5 text-muted"/><input className="w-full outline-none" placeholder="Search for services"/></div>
            </label>
            <label className="block">
              <div className="mb-1 text-sm text-muted">Location</div>
              <div className="input flex items-center gap-2"><MapPinIcon className="w-5 h-5 text-muted"/><input className="w-full outline-none" placeholder="Enter postcode or area"/></div>
            </label>
            <label className="block">
              <div className="mb-1 text-sm text-muted">Date</div>
              <div className="input flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-muted"/><input type="date" className="w-full outline-none"/></div>
            </label>
            <button className="btn btn-primary w-full mt-1">Search TrimZi</button>
          </div>
        </div>

        {/* Right hero area */}
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h1 className="h1 mb-3">Book 5★ services<br/>in seconds</h1>
            <p className="text-muted">Premium grooming for men. Clean design, instant booking, trusted pros.</p>
          </div>
          <div className="relative aspect-[4/3] w-full rounded-card overflow-hidden shadow-card">
            {/* Replace /hero.jpg with a real photo of a men’s haircut */}
            <Image src="/hero.jpg" alt="Men's haircut" fill className="object-cover"/>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        © {new Date().getFullYear()} TrimZi
      </footer>
    </div>
  );
}
