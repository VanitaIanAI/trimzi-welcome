// app/booking/confirmed/page.tsx

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

type BookingDetails = {
  serviceName: string | null;
  barberName: string | null;
  startISO: string | null;
  price: number | null;
  note: string | null;
  paymentStatus: string | null;
};

// UK display date dd{st|nd|rd|th} Month yyyy
function formatUKDate(iso: string): string {
  const d = new Date(iso);

  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
      ? 'nd'
      : day % 10 === 3 && day !== 13
      ? 'rd'
      : 'th';

  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  const year = d.getFullYear();

  return `${weekday}, ${day}${suffix} ${month} ${year}`;
}

// HH:mm in en-GB
function formatUKTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BookingConfirmedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const eventId = searchParams.get('eventId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<BookingDetails | null>(null);

  useEffect(() => {
    if (!eventId) {
      setError('Missing booking information.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/bookings/get-by-event?eventId=${encodeURIComponent(eventId!)}`
        );
        const json = await res.json();

        if (cancelled) return;

        if (!res.ok || !json?.ok) {
          setError(json?.error || 'Could not load booking details.');
          setLoading(false);
          return;
        }

        setDetails({
          serviceName: json.serviceName ?? null,
          barberName: json.barberName ?? null,
          startISO: json.startISO ?? null,
          price:
            typeof json.price === 'number' && !Number.isNaN(json.price)
              ? json.price
              : null,
          note: json.note ?? null,
          paymentStatus: json.paymentStatus ?? null,
        });
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error('Error loading booking details:', e);
        setError('Could not load booking details.');
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const dateLabel =
    details?.startISO ? formatUKDate(details.startISO) : 'Soon';
  const timeLabel =
    details?.startISO ? formatUKTime(details.startISO) : '';

  const serviceLabel = details?.serviceName || 'Your booking';
  const barberLabel = details?.barberName || 'Your barber';

  const priceLabel =
    typeof details?.price === 'number'
      ? `£${details.price.toFixed(2).replace(/\.00$/, '')}`
      : null;

  // Simple messaging about payment — this can be refined later using paymentStatus
  const paidOnline =
    details?.paymentStatus &&
    details.paymentStatus.toLowerCase() === 'paid';

  return (
    <div className="min-h-dvh bg-ivory text-brown">
      {/* Top app bar (same style as other pages) */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-brown/10">
        <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center justify-between">
          <h1 className="brand text-brown text-xl font-bold">TrimZi</h1>
          <Link
            href="/home"
            className="text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
          >
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 pb-24">
        <section className="mt-6 rounded-xl bg-white border border-brown/10 p-5 shadow-sm">
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 rounded-full border-2 border-brown/20 border-t-brown animate-spin" />
              <p className="text-sm text-brown/80">
                Loading your booking details…
              </p>
            </div>
          ) : error ? (
            <>
              <h2 className="text-brown text-lg font-semibold mb-2">
                Booking details
              </h2>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              <button
                type="button"
                className="h-11 px-4 rounded-xl bg-brown text-white text-sm font-semibold hover:bg-brown/90"
                onClick={() => router.push('/home')}
              >
                Back to Home
              </button>
            </>
          ) : (
            <>
              <h2 className="text-brown text-lg font-semibold mb-1">
                Booking confirmed 🎉
              </h2>
              <p className="text-brown/80 text-sm mb-4">
                You&apos;ll receive an email shortly with your booking details.
              </p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-brown/70">Service</span>
                  <span className="font-medium text-brown">
                    {serviceLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brown/70">Date</span>
                  <span className="font-medium text-brown">
                    {dateLabel}
                  </span>
                </div>
                {timeLabel && (
                  <div className="flex justify-between">
                    <span className="text-brown/70">Time</span>
                    <span className="font-medium text-brown">
                      {timeLabel}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-brown/70">Barber</span>
                  <span className="font-medium text-brown">
                    {barberLabel}
                  </span>
                </div>
                {priceLabel && (
                  <div className="flex justify-between">
                    <span className="text-brown/70">Price</span>
                    <span className="font-medium text-brown">
                      {priceLabel}
                    </span>
                  </div>
                )}
              </div>

              {paidOnline && (
                <p className="mt-4 text-xs text-brown/70">
                  Payment has been recorded as{' '}
                  <span className="font-semibold">paid online via Square</span>.
                </p>
              )}

              <p className="mt-4 text-xs text-brown/60">
                If anything looks wrong or you don&apos;t receive a
                confirmation email, please contact the shop directly.
              </p>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  className="flex-1 h-12 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90"
                  onClick={() => router.push('/home')}
                >
                  Back to Home
                </button>
                <Link
                  href="/bookings"
                  className="h-12 flex-1 rounded-xl border border-brown/20 text-brown text-sm font-semibold flex items-center justify-center hover:bg-brown/5"
                >
                  View my bookings
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}