'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function CancelPage() {
  const search = useSearchParams();
  const token = search.get('token');
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    fetch(`/api/cancel-by-email?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? setStatus('ok') : setStatus('error'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <main className="mx-auto max-w-[720px] p-8 text-center text-brown">
      {status === 'loading' && <p>Cancelling your booking…</p>}
      {status === 'ok' && <p>Your booking has been cancelled ✅</p>}
      {status === 'error' && <p>Link invalid or expired ❌</p>}
    </main>
  );
}
