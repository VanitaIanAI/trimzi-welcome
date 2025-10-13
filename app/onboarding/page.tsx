/* app/onboarding/page.tsx */
'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

import { auth, googleProvider, db } from '../../lib/firebaseClient';
import {
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  UserCredential,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

/** Create/merge a basic profile for the user */
async function ensureProfile(
  uid: string,
  data?: Partial<{ name: string; email: string; phone: string }>
) {
  await setDoc(
    doc(db, 'profiles', uid),
    { createdAt: serverTimestamp(), ...data },
    { merge: true }
  );
}

export default function Onboarding() {
  const router = useRouter();

  // Inline email form state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const disabled = pending;

  // DEV: pause auto-redirect while testing (set to false when done)
  const DEV_NO_AUTO_REDIRECT = true;

  // Consume Google redirect result *and* wait for Auth to be ready
React.useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (u) => {
    try {
      if (u) {
        // In dev mode, do not auto-redirect when a user is already signed in
        if (DEV_NO_AUTO_REDIRECT) return;

        await ensureProfile(u.uid, {
          name: u.displayName ?? '',
          email: u.email ?? '',
        });
        router.push('/home');
        return;
      }

      // If not signed in yet, check if a redirect just completed
      const cred = await getRedirectResult(auth);
      if (cred?.user) {
        // In dev mode, do not auto-redirect after redirect-based sign-in
        if (DEV_NO_AUTO_REDIRECT) return;
        
        await ensureProfile(cred.user.uid, {
          name: cred.user.displayName ?? '',
          email: cred.user.email ?? '',
        });
        router.push('/home');
      }
    } catch (e) {
      console.warn('Auth init / redirect handling failed:', e);
    }
  });

  return () => unsub();
}, [router]);


  // --- Google flow ---
  const handleGoogle = async () => {
    if (disabled) return;
    setPending(true);
    try {
      let cred: UserCredential | null = null;
      try {
        // try popup first
        cred = await signInWithPopup(auth, googleProvider);
      } catch (err: any) {
        console.warn('Popup sign-in failed, falling back to redirect:', err?.code || err);
        await signInWithRedirect(auth, googleProvider);
        return; // page will reload after redirect
      }

      const u = cred?.user;
      if (u) {
        try {
          await ensureProfile(u.uid, {
            name: u.displayName ?? '',
            email: u.email ?? '',
          });
        } catch (e) {
          console.warn('ensureProfile (google) failed:', e);
        }
        router.push('/home');
      }
    } catch (e: any) {
      console.error('Google sign-in failed:', e?.code || e, e);
      alert('Google sign-in failed.');
    } finally {
      setPending(false);
    }
  };

  // --- Email flow (signup/signin) ---
  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    setPending(true);
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await ensureProfile(cred.user.uid, { name: name.trim(), email: email.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      router.push('/home');
    } catch (err) {
      console.error(err);
      alert('Email auth failed. Please check your details and try again.');
    } finally {
      setPending(false);
    }
  };

  // --- Guest flow (anonymous) ---
  const handleGuest = async () => {
    if (disabled) return;
    setPending(true);
    try {
      const cred = await signInAnonymously(auth);
      await ensureProfile(cred.user.uid); // blank profile; you can collect name later
      router.push('/home'); // booking flow can request phone/name before confirming
    } catch (e) {
      console.error(e);
      alert('Guest sign-in failed. Please try again.');
    } finally {
      setPending(false);
    }
  };

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
        {!showEmailForm ? (
          <div className="flex flex-col items-stretch gap-4">
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={disabled}
              className="w-full h-14 rounded-2xl bg-white text-brown border border-brown/20 shadow-sm hover:bg-white/90 transition flex items-center justify-center gap-3 disabled:opacity-60"
              aria-label="Continue with Google"
            >
              <Image src="/icons/google.svg" alt="Google" width={22} height={22} />
              <span className="text-base font-medium">Continue with Google</span>
            </button>

            {/* Email */}
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              disabled={disabled}
              className="w-full h-14 rounded-2xl bg-brown text-white font-semibold shadow-lg hover:bg-brown-dark transition disabled:opacity-60"
              aria-label="Continue with Email"
            >
              Continue with Email
            </button>

            {/* Guest */}
            <button
              type="button"
              onClick={handleGuest}
              disabled={disabled}
              className="w-full h-14 rounded-2xl bg-ivory text-brown border border-brown/20 hover:bg-ivory/80 transition flex items-center justify-center font-medium disabled:opacity-60"
              aria-label="Continue as Guest"
            >
              Continue as Guest
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleEmail}
            className="mx-auto mt-2 w-full max-w-md rounded-2xl bg-white border border-brown/10 p-5 shadow-sm"
          >
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    value="signin"
                    checked={mode === 'signin'}
                    onChange={() => setMode('signin')}
                  />
                  Sign in
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="mode"
                    value="signup"
                    checked={mode === 'signup'}
                    onChange={() => setMode('signup')}
                  />
                  Create account
                </label>
              </div>
            </div>

            {mode === 'signup' && (
              <div className="mb-3">
                <label className="block text-sm mb-1">Full name</label>
                <input
                  className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-sm mb-1">Email</label>
              <input
                type="email"
                name="email"
                className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm mb-1">Password</label>
              <input
                type="password"
                name="password"
                className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={disabled}
                className="flex-1 h-11 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90 transition disabled:opacity-60"
              >
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="h-11 rounded-xl px-4 border border-brown/20 text-brown hover:bg-ivory/80 transition"
              >
                Back
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}