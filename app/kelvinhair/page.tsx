// app/kelvinhair/page.tsx
import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

export const metadata = {
  title: 'Kelvinhair – TrimZi',
};

// one source of truth for your services (updated – 5 items)
const services = [
  { id: 'mens_scissor_cut',    name: "Men's - Scissor cut",          price: 20, durationMins: 40 },
  { id: 'mens_clipper_cut',    name: "Men's - Clipper cut / Fade",  price: 22, durationMins: 45 },
  { id: 'student_scissor_cut', name: 'Student - Scissor cut',        price: 15, durationMins: 40 },
  { id: 'student_clipper_cut', name: 'Student - Clipper cut / Fade', price: 17, durationMins: 45 },
  { id: 'boys_cut',            name: 'Boys cut (<14)',              price: 14, durationMins: 30 },
];

const featured = services.slice(0, 3);
const more = services.slice(3);

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
  return (
    <div className="min-h-dvh bg-ivory pb-24">
      {/* Top app bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-brown/10">
        <div className="mx-auto max-w-[720px] h-14 px-4 flex items-center justify-between">
          <h1 className="brand text-brown text-xl font-bold">TrimZi</h1>
          <Link href="/onboarding" className="text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5">
            Back
          </Link>
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
        
      </main>
    </div>
  );
}
