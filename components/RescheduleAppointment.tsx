'use client';

import { useEffect, useRef, useState } from 'react';
import { auth } from '../lib/firebaseClient';
import { formatRescheduleDateTime as ukTime, formatRescheduleTime } from '@lib/rescheduleDisplay';

const WHATSAPP = 'https://wa.me/447900473307';
const SMS = 'sms:+447900473307';
function todayUK() {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}

export default function RescheduleAppointment({bookingId, onClose}: {bookingId: string; onClose: () => void}) {
  const [phase, setPhase] = useState<'loading' | 'choose' | 'confirm' | 'contact' | 'done' | 'error'>('loading');
  const [reason, setReason] = useState('');
  const [startISO, setStartISO] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [notificationWarning, setNotificationWarning] = useState(false);
  const [reload, setReload] = useState(0);
  const requestId = useRef<string | null>(null);
  const busy = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const accountUid = useRef(auth.currentUser?.uid);

  async function api(url: string, init: RequestInit = {}) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous || user.uid !== accountUid.current) throw new Error('Please sign in again before changing your appointment.');
    const token = await user.getIdToken();
    const response = await fetch(url, {...init, headers: {...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'}});
    const data = await response.json();
    if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || 'We could not check your appointment.'), {status: response.status});
    return data;
  }

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = bodyOverflow; previous?.focus(); };
  }, []);

  // A phase change removes the focused button; keep keyboard focus inside the modal.
  useEffect(() => { dialog.current?.focus(); }, [phase, saving]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    setPhase('loading');
    setError('');
    api(`/api/reschedule?bookingId=${encodeURIComponent(bookingId)}`, {signal: controller.signal})
      .then(data => {
        if (!active) return;
        if (!data.eligible) { setReason(data.reason); setPhase('contact'); return; }
        setStartISO(data.startISO); setEmail(data.confirmationEmail); setPhase('choose');
      })
      .catch(e => { if (active) { setError(e.name === 'AbortError' ? 'The diary took too long to respond. Please try again.' : e.message); setPhase('error'); } })
      .finally(() => window.clearTimeout(timer));
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
    // The request is bound to this mounted booking and signed-in account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, reload]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    setLoadingSlots(true); setSlots([]); setTime(''); setError(''); requestId.current = null;
    api(`/api/reschedule?bookingId=${encodeURIComponent(bookingId)}&date=${encodeURIComponent(date)}`, {signal: controller.signal})
      .then(data => {
        if (!active) return;
        if (!data.eligible) { setReason(data.reason); setPhase('contact'); return; }
        if (data.startISO !== startISO) { setError('Your appointment has changed. Close this window and reopen it to check the latest details.'); return; }
        setSlots(data.available || []);
      })
      .catch(e => { if (active) setError(e.name === 'AbortError' ? 'Availability took too long to load. Please choose the date again.' : e.message); })
      .finally(() => { window.clearTimeout(timer); if (active) setLoadingSlots(false); });
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, bookingId]);

  async function confirmChange() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    requestId.current ||= crypto.randomUUID();
    try {
      const data = await api('/api/reschedule', {method: 'POST', signal: AbortSignal.timeout(45_000), body: JSON.stringify({
        bookingId, date, time, expectedStartISO: startISO, requestId: requestId.current,
      })});
      setStartISO(data.startISO); setNotificationWarning(!data.notificationsAccepted); setPhase('done');
    } catch (e: any) {
      // Keep the same request ID and selection after an unknown outcome.
      setUncertain(!e.status || e.status >= 500);
      setError(e.message || 'We could not confirm the result. Please retry this confirmation or contact Ian.');
    } finally { busy.current = false; setSaving(false); }
  }

  const button = 'rounded-xl px-4 py-3 border border-brown/20 text-brown disabled:opacity-50';
  function close() { if (!busy.current) onClose(); }
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={e => {if (e.target === e.currentTarget) close();}}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="reschedule-title" tabIndex={-1}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.stopPropagation(); close(); }
          if (e.key === 'Tab') {
            const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)') || []);
            const first = controls[0], last = controls[controls.length - 1];
            if (!first) {e.preventDefault(); return;}
            if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {e.preventDefault(); last.focus();}
            if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first.focus();}
          }
        }}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-ivory p-6 space-y-4 text-brown shadow-xl">
        <h2 id="reschedule-title" className="text-xl font-semibold">{phase === 'done' ? 'Appointment changed' : 'Change your appointment'}</h2>
        {phase === 'loading' && <p role="status">Checking your appointment…</p>}
        {phase === 'contact' && <>
          <p>{reason === 'older'
            ? 'This booking was made before online appointment changes became available. Please contact Ian by WhatsApp or text to rearrange.'
            : reason === 'notice'
              ? 'Your appointment is within the next 24 hours. Please contact Ian directly to discuss a change.'
              : 'Please contact Ian directly to discuss a change to this appointment.'}</p>
          <p>Your appointment remains confirmed.</p>
          <div className="flex flex-wrap gap-3"><a className={button} href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp Ian</a><a className={button} href={SMS}>Text Ian</a></div>
        </>}
        {phase === 'choose' && <>
          <p className="text-sm">Current appointment: <strong>{ukTime(startISO)}</strong></p>
          <p className="text-sm">Choose another available time. Your current appointment stays reserved until you confirm the change.</p>
          <label className="block">Choose date<input className="mt-2 w-full rounded-xl border border-brown/20 bg-white p-3" type="date" min={todayUK()} value={date} onChange={e => setDate(e.target.value)} /></label>
          {loadingSlots ? <p role="status">Checking available times…</p> : date && !error && <>
            <p className="text-sm">{slots.length ? 'Available times (UK time)' : 'No available times on this date. Please choose another date.'}</p>
            <div className="grid grid-cols-3 gap-2">{slots.map(slot => <button key={slot} aria-pressed={slot === time} className={`${button} ${slot === time ? 'bg-brown text-white' : 'bg-white'}`} onClick={() => setTime(slot)}>{formatRescheduleTime(slot)}</button>)}</div>
          </>}
          <button className={`${button} w-full bg-brown text-white`} disabled={!time || loadingSlots || Boolean(error)} onClick={() => {setError(''); setPhase('confirm');}}>Review change</button>
        </>}
        {phase === 'confirm' && <>
          <p>From: <strong>{ukTime(startISO)}</strong></p>
          <p>To: <strong>{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {weekday:'short',day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/London'})} · {formatRescheduleTime(time)} (UK time)</strong></p>
          <p className="text-sm">Your service, barber, price and payment arrangements stay the same. We will email the updated details to {email}.</p>
          <button className={`${button} w-full bg-brown text-white`} disabled={saving} onClick={confirmChange}>{saving ? 'Changing appointment…' : uncertain ? 'Check this change again' : 'Confirm change'}</button>
          {!uncertain && <button className={button} disabled={saving} onClick={() => {setPhase('choose'); setError(''); requestId.current = null;}}>Back</button>}
          {uncertain && <p className="text-sm">If you are unsure of the result, contact Ian before making a different change. Retrying this confirmation will check the same request.</p>}
        </>}
        {phase === 'done' && <><p>Your appointment is now <strong>{ukTime(startISO)}</strong>.</p><p>Your bookings will show the updated time.</p>{notificationWarning && <p className="text-sm">We could not confirm acceptance of every confirmation message. Your appointment change is saved.</p>}</>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {phase === 'error' && <button className={button} onClick={() => setReload(n => n + 1)}>Try again</button>}
        <button className={`${button} w-full`} disabled={saving} onClick={close}>{phase === 'done' ? 'Done' : phase === 'contact' ? 'Keep appointment' : 'Close'}</button>
      </div>
    </div>
  );
}
