// app/kelvinhair/page.tsx
import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Kelvinhair – TrimZi',
};

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
            {/* optional badge spot kept empty to preserve spacing */}
          </div>
        </section>

        {/* Services list (three items) */}
        <section className="bg-white rounded-xl border border-brown/10 divide-y divide-brown/10">
          <div className="p-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-brown font-medium">Men – Scissor cut</h3>
              <p className="text-brown/70 text-sm mt-1">40 mins</p>
            </div>
            <div className="text-right">
              <div className="text-brown font-semibold">£22</div>
              <button className="mt-2 text-sm px-3 py-1 rounded-md bg-brown text-white hover:opacity-90">
                Add
              </button>
            </div>
          </div>

          <div className="p-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-brown font-medium">Student – Scissor cut</h3>
              <p className="text-brown/70 text-sm mt-1">40 mins</p>
            </div>
            <div className="text-right">
              <div className="text-brown font-semibold">£20</div>
              <button className="mt-2 text-sm px-3 py-1 rounded-md bg-brown text-white hover:opacity-90">
                Add
              </button>
            </div>
          </div>

          <div className="p-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-brown font-medium">Student – Clipper cut / Fade</h3>
              <p className="text-brown/70 text-sm mt-1">45 mins</p>
            </div>
            <div className="text-right">
              <div className="text-brown font-semibold">£18</div>
              <button className="mt-2 text-sm px-3 py-1 rounded-md bg-brown text-white hover:opacity-90">
                Add
              </button>
            </div>
          </div>
        </section>

        <div className="px-1">
          <Link
            href="#"
            className="block w-full text-center border border-brown text-brown py-3 rounded-lg hover:bg-brown/5"
          >
            Full styling options
          </Link>
        </div>
      </main>
    </div>
  );
}
