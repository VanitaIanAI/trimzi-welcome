// app/cancel/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function CancelPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    let aborted = false;

    async function run() {
      if (!token) {
        setStatus('error');
        setMessage('Missing cancellation token.');
        return;
      }
      setStatus('working');

      try {
        const res = await fetch('/api/cancel-by-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json().catch(() => ({} as any));

        if (!aborted) {
          if (res.ok && json?.ok) {
            setStatus('success');
            setMessage('Your booking has been cancelled.');
          } else {
            setStatus('error');
            setMessage(json?.error || 'This link is invalid or has expired.');
          }
        }
      } catch (e) {
        if (!aborted) {
          setStatus('error');
          setMessage('Something went wrong cancelling your booking.');
        }
      }
    }

    run();
    return () => {
      aborted = true;
    };
  }, [token]);

  return (
    <div className="min-h-dvh bg-ivory">
      <main className="mx-auto max-w-[720px] px-4 py-10">
        <h1 className="text-brown text-2xl font-bold mb-4">Cancel booking</h1>

        {status === 'working' && (
          <div className="rounded-xl bg-white border border-brown/10 p-5 flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-brown/20 border-t-brown animate-spin" />
            <p className="text-brown">Cancelling your booking…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="rounded-xl bg-white border border-brown/10 p-5">
            <p className="text-brown">{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl bg-white border border-red-200 p-5">
            <p className="text-red-700">{message}</p>
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/home"
            className="inline-flex items-center justify-center h-11 px-4 rounded-xl bg-brown text-white hover:bg-brown/90"
          >
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
