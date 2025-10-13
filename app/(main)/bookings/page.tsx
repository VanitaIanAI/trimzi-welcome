// app/(main)/bookings/page.tsx
import Link from 'next/link';

export const metadata = {
  title: 'Your bookings – TrimZi',
};

export default function BookingsPage() {
  return (
    <div className="min-h-dvh bg-ivory pb-24">
      <main className="mx-auto max-w-[720px] px-4 pt-6 space-y-4">
        <h1 className="text-brown text-2xl font-semibold">Your bookings</h1>
        <p className="text-brown/80">
          This is a placeholder. Upcoming and past bookings will appear here.
        </p>

        <div className="mt-4">
          <Link
            href="/(main)/home"
            className="inline-block text-sm text-brown border border-brown px-3 py-1 rounded-md hover:bg-brown/5"
          >
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}