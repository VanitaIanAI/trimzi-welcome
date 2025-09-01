/* app/onboarding/page.tsx */
'use client';

import Image from 'next/image';
import Link from 'next/link';

export default function Onboarding() {
  return (
    <main className="min-h-dvh bg-ivory flex items-center justify-center">
      <div className="w-full max-w-[720px] px-6 md:px-8">
        {/* Small logo & wordmark */}
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/logo-trimzi.svg"
            alt="TrimZi logo"
            width={28}
            height={28}
            className="mb-1"
            priority
          />
          <span className="text-sm text-brown/80">TrimZi</span>
        </div>

        {/* Big brand heading */}
        <h1 className="text-center text-brown text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
          TrimZi
        </h1>

        {/* Subtitle */}
        <p className="text-center text-brown/80 text-xl md:text-2xl leading-relaxed mb-8">
          Premium grooming,<br className="hidden sm:block" />
          at your fingertips.
        </p>

        {/* Buttons */}
        <div className="flex flex-col items-stretch gap-4">
          {/* Google */}
          <button
            type="button"
            className="w-full h-14 rounded-2xl bg-white text-brown border border-brown/20 shadow-sm hover:bg-white/90 transition flex items-center justify-center gap-3"
            aria-label="Continue with Google"
          >
            <Image
              src="/icons/google.svg"
              alt="Google"
              width={22}
              height={22}
            />
            <span className="text-base font-medium">Continue with Google</span>
          </button>

          {/* Email */}
          <button
            type="button"
            className="w-full h-14 rounded-2xl bg-brown text-white font-semibold shadow-lg hover:bg-brown-dark transition"
            aria-label="Continue with Email"
          >
            Continue with Email
          </button>

          {/* Guest */}
          <Link
            href="/home"
            className="w-full h-14 rounded-2xl bg-ivory text-brown border border-brown/20 hover:bg-ivory/80 transition flex items-center justify-center font-medium"
            aria-label="Continue as Guest"
          >
            Continue as Guest
          </Link>
        </div>
      </div>
    </main>
  );
}
