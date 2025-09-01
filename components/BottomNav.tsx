'use client';
import Link from 'next/link';
import { ScissorsIcon, MapPinIcon, ShopIcon, SearchIcon } from '../components/Icon';

export default function BottomNav() {
  const item = 'flex flex-col items-center justify-center gap-1 text-[11px]';
  const icon = 'w-5 h-5';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t border-border/70 safe-bottom shadow-[0_-6px_20px_rgba(0,0,0,0.05)]">
      <div className="mx-auto max-w-[720px] grid grid-cols-4 h-16">
        <Link href="/" className={`${item} text-brown`}>
          <SearchIcon className={icon} />
          <span>Home</span>
        </Link>
        <Link href="#" className={`${item} text-muted hover:text-charcoal`}>
          <ScissorsIcon className={icon} />
          <span>Book</span>
        </Link>
        <Link href="#" className={`${item} text-muted hover:text-charcoal`}>
          <MapPinIcon className={icon} />
          <span>Nearby</span>
        </Link>
        <Link href="#" className={`${item} text-muted hover:text-charcoal`}>
          <ShopIcon className={icon} />
          <span>Profile</span>
        </Link>
      </div>
    </nav>
  );
}
