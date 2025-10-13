/* app/(main)/layout.tsx */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../../lib/firebaseClient';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // auth state (to decide if we show bottom nav)
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const showToolbar = authReady && user && !user.isAnonymous;

  // helper for active state
  const isActive = (href: string) => pathname === href;

  return (
    <div className={`min-h-dvh ${showToolbar ? 'pb-20' : ''} bg-ivory`}>
      {children}

      {/* Bottom toolbar (style-only update) */}
{showToolbar && (
  <nav className="fixed bottom-0 inset-x-0 z-50 bg-brown text-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
    <div className="mx-auto max-w-[720px]">
      <div className="grid grid-cols-4 h-16 items-center gap-1 px-2">
        {[
          { href: '/home', label: 'Home' },
          { href: '/bookings', label: 'Bookings' },
          { href: '/favourites', label: 'Favourites' },
          { href: '/profile', label: 'Profile' },
        ].map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                // base
                'flex items-center justify-center rounded-full h-10 text-xs font-medium tracking-wide transition-all',
                // inactive
                !active && 'opacity-85 hover:opacity-100 hover:bg-white/10',
                // active pill
                active && 'bg-white/15 border border-white/20 shadow-sm',
              ].join(' ')}
            >
              <span className="px-3">{tab.label}</span>
            </Link>
          );
        })}
      </div>
      {/* iOS safe-area bump */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  </nav>
)}
    </div>
  );
}