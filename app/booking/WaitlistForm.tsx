'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebaseClient';
import { savedBookingContact } from '@lib/contactDetails';

const periods = { morning: 'Before 12 pm', afternoon: '12–4 pm', evening: 'After 4 pm' };
type Period = keyof typeof periods;

export default function WaitlistForm({ date, serviceId, serviceName, barber, onBack }: {
  date: string; serviceId: string; serviceName: string; barber: string; onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferences, setPreferences] = useState<Period[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;
    let active = true;
    getDoc(doc(db, 'profiles', user.uid)).then(snapshot => {
      if (!active || auth.currentUser?.uid !== user.uid) return;
      const contact = savedBookingContact(snapshot.data() ?? {}, user);
      setName(current => current || contact.name);
      setPhone(current => current || contact.phone);
    }).catch(() => { /* The customer can enter their contact details. */ });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || saved) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/test-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TrimZi-Waitlist': 'test' },
        body: JSON.stringify({ date, serviceId, barber, name, phone, preferences }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not join the waiting list.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="my-4 rounded-xl border border-brown/20 p-4 text-sm text-brown" aria-labelledby="waitlist-title">
      <h2 id="waitlist-title" className="font-semibold">Join the waiting list</h2>
      <p className="mt-2">{new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Europe/London' }).format(new Date(date + 'T12:00:00Z'))} · {serviceName}</p>
      {saved ? <p className="mt-3" role="status">You’re on the waiting list. Ian can contact you if a time opens up.</p> : (
        <form className="mt-3 space-y-3" onSubmit={submit}>
          <p>This is a test preview. Use fictional details.</p>
          <label className="block">Name<input required maxLength={100} autoComplete="name" value={name}
            onChange={event => setName(event.target.value)} className="block w-full rounded-md border border-brown/30 p-2" /></label>
          <label className="block">Best mobile number<input required maxLength={30} type="tel" autoComplete="tel" value={phone}
            onChange={event => setPhone(event.target.value)} className="block w-full rounded-md border border-brown/30 p-2" /></label>
          <fieldset>
            <legend>Preferred times</legend>
            {(Object.keys(periods) as Period[]).map(period => <label key={period} className="block py-1">
              <input type="checkbox" className="mr-2" checked={preferences.includes(period)}
                onChange={event => setPreferences(current => event.target.checked ? [...current, period] : current.filter(value => value !== period))} />{periods[period]}
            </label>)}
            <button type="button" className="underline" onClick={() => setPreferences(Object.keys(periods) as Period[])}>Any time</button>
          </fieldset>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-md bg-brown px-3 py-2 text-white disabled:opacity-50">
            {saving ? 'Joining…' : 'Join waiting list'}
          </button>
        </form>
      )}
      <button type="button" className="mt-3 underline" disabled={saving} onClick={onBack}>Back to dates</button>
    </section>
  );
}
