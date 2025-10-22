/* app/onboarding/page.tsx */
'use client';

// TEMP: verbose Firebase Auth logs in console
if (typeof window !== 'undefined') localStorage.setItem('firebase:log','true');

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
  linkWithPopup,
  linkWithRedirect,
  GoogleAuthProvider,
  User,
  UserCredential,
  sendPasswordResetEmail,
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
  const redirectCheckedRef = React.useRef(false);

  // Inline email form state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const disabled = pending;
  const [showPassword, setShowPassword] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);
  // Show a blocking overlay across the redirect round-trip
const [authInProgress, setAuthInProgress] = useState(false);


  // DEV: pause auto-redirect while testing (set to false when done)
  const DEV_NO_AUTO_REDIRECT = false;

  // On github.dev, the redirect flow loses state.  Force popup there.
  const FORCE_POPUP = 
    typeof window !== 'undefined' && window.location.host.endsWith('.github.dev');

    // If a Google flow is already in progress (pre-redirect), keep overlay visible after we come back
React.useEffect(() => {
  try {
    if (typeof window !== 'undefined' && sessionStorage.getItem('authInProgress') === '1') {
      setAuthInProgress(true);
    }
  } catch {}
}, []);

// Handle Google redirect result ONCE on first mount
React.useEffect(() => {
  if (redirectCheckedRef.current) return;
  redirectCheckedRef.current = true;

  (async () => {
    try {
      const cred = await getRedirectResult(auth);
      console.log('[Auth] getRedirectResult (mount):', cred);

      if (cred?.user && !cred.user.isAnonymous) {
  if (DEV_NO_AUTO_REDIRECT) return;

  await ensureProfile(cred.user.uid, {
    name: cred.user.displayName ?? '',
    email: cred.user.email ?? '',
  });

  try { sessionStorage.removeItem('authInProgress'); } catch {}
  setAuthInProgress(false);

  window.location.assign('/home');
}
    } catch (e) {
      console.warn('[Auth] getRedirectResult threw:', e);
    }
  })();
}, [router]);



  // Listen for auth state changes (popup success or post-redirect sign-in)
React.useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (u) => {
    try {
      console.log('[Auth] onAuthStateChanged user:', u?.uid, { isAnonymous: u?.isAnonymous });

      if (u && !u.isAnonymous) {
  if (DEV_NO_AUTO_REDIRECT) return;

  await ensureProfile(u.uid, {
    name: u.displayName ?? '',
    email: u.email ?? '',
  });

  try { sessionStorage.removeItem('authInProgress'); } catch {}
  setAuthInProgress(false);

  window.location.assign('/home');
  return;
}

      // If here: no user or anonymous user. Redirect result is handled by the separate "mount" effect.
    } catch (e) {
      console.warn('Auth init / redirect handling failed:', e);
    }
  });

  return () => unsub();
}, [router]);



 // --- Google flow (popup on github.dev; redirect elsewhere; upgrades anonymous users) ---
const handleGoogle = async () => {
  if (disabled) return;
  setPending(true);


setAuthInProgress(true);
try { sessionStorage.setItem('authInProgress', '1'); } catch {}

  try {
    const current = auth.currentUser;
    console.log('[Auth] handleGoogle: currentUser:', current?.uid, { isAnonymous: current?.isAnonymous });

    try {
      if (FORCE_POPUP) {
        // ✅ On github.dev use POPUP first (redirect loses state)
        if (current && current.isAnonymous) {
          console.log('[Auth] linkWithPopup -> Google (upgrade anon)');
          await linkWithPopup(current, googleProvider);
        } else {
          console.log('[Auth] signInWithPopup -> Google');
          await signInWithPopup(auth, googleProvider);
        }
        console.log('[Auth] popup flow resolved — onAuthStateChanged will run');
        return;
      }

      // Elsewhere (localhost / deployed), prefer REDIRECT
      if (current && current.isAnonymous) {
        console.log('[Auth] linkWithRedirect -> Google (upgrade anon)');
        await linkWithRedirect(current, googleProvider);
      } else {
        console.log('[Auth] signInWithRedirect -> Google');
        await signInWithRedirect(auth, googleProvider);
      }
      return; // page will navigate; getRedirectResult/onAuthStateChanged will handle it
    } catch (err: any) {
      console.warn('[Auth] primary flow failed, falling back. code=', err?.code, 'message=', err?.message);

      // Fallback: if popup failed on non-github hosts, try redirect; if redirect failed on github, surface error.
      if (FORCE_POPUP) {
        throw err; // on github.dev we don't attempt redirect fallback
      } else {
        if (current && current.isAnonymous) {
          console.log('[Auth] (fallback) linkWithRedirect -> Google (upgrade anon)');
          await linkWithRedirect(current, googleProvider);
        } else {
          console.log('[Auth] (fallback) signInWithRedirect -> Google');
          await signInWithRedirect(auth, googleProvider);
        }
        return;
      }
    }
  
  setAuthInProgress(false);
try { sessionStorage.removeItem('authInProgress'); } catch {}
  
  } catch (e: any) {
    console.error('[Auth] Google flow failed at outer try:', e?.code || e, e);
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
    } catch (err: any) {
  console.error('[Auth] email flow error:', err?.code || err, err);

  const code = err?.code;

  if (mode === 'signup') {
    switch (code) {
      case 'auth/email-already-in-use':
        alert('That email is already in use. Try signing in instead, or use “Forgot password?”.');
        return;
      case 'auth/invalid-email':
        alert('That email address looks invalid.');
        return;
      case 'auth/weak-password':
        alert('Password is too weak. Please use at least 6 characters.');
        return;
      default:
        alert('Could not create your account. Please check details and try again.');
        return;
    }
  } else {
    // mode === 'signin'
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        alert('Incorrect email or password.');
        return;
      case 'auth/user-not-found':
        alert('No account found for that email. Create an account first.');
        return;
      case 'auth/invalid-email':
        alert('That email address looks invalid.');
        return;
      default:
        alert('Sign-in failed. Please check your details and try again.');
        return;
    }
  }
}

  };

// Perform the actual anonymous sign-in
const proceedGuest = async () => {
  setPending(true);
  try {
    const cred = await signInAnonymously(auth);
    await ensureProfile(cred.user.uid); // blank profile; collect name/phone later
    router.push('/home');
  } catch (e) {
    console.error(e);
    alert('Guest sign-in failed. Please try again.');
  } finally {
    setPending(false);
  }
};

// --- Password reset (email) ---
const handleForgotPassword = async () => {
  if (disabled) return;
  if (!email.trim()) {
    alert('Enter your email above first, then tap “Forgot password?”.');
    return;
  }
  setPending(true);
  try {
    await sendPasswordResetEmail(auth, email.trim());
    alert('Password reset email sent. Please check your inbox.');
  } catch (err: any) {
    console.error('[Auth] sendPasswordResetEmail error:', err?.code || err, err);
    switch (err?.code) {
      case 'auth/invalid-email':
        alert('That email address looks invalid.');
        break;
      case 'auth/user-not-found':
        alert('No account exists with that email.');
        break;
      default:
        alert('Could not send reset email. Please try again.');
    }
  } finally {
    setPending(false);
  }
};


  // --- Guest flow (anonymous) ---
const handleGuest = async () => {
  if (disabled) return;

  // Show the one-time notice modal first (per browser session)
  try {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('guestModalShown')) {
      sessionStorage.setItem('guestModalShown', '1');
      setShowGuestModal(true);
      return; // do NOT sign in yet; wait for user to choose in the modal
    }
  } catch {
    // if sessionStorage fails, just show the modal
    setShowGuestModal(true);
    return;
  }

  // If the notice has already been shown in this session, proceed immediately
  await proceedGuest();
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
  <label htmlFor="password" className="block text-sm mb-1">Password</label>

  <div className="relative">
    <input
      id="password"
      type={showPassword ? 'text' : 'password'}
      name="password"
      className="w-full rounded-md border border-brown/20 bg-ivory px-3 py-2 pr-10 text-sm"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder="••••••••"
      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
      required
      minLength={6}
      aria-describedby="password-help"
    />

    {/* Eye toggle button */}
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      aria-pressed={showPassword}
      className="absolute inset-y-0 right-2 flex items-center px-2 rounded-md hover:bg-brown/10 focus:outline-none focus:ring-2 focus:ring-brown/30"
      tabIndex={0}
    >
      {/* Simple inline SVG so you don’t need any new assets */}
      {showPassword ? (
        // Eye-off icon
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M10.58 10.58A3 3 0 0012 15a3 3 0 002.42-4.42M9.88 5.09A10.93 10.93 0 0112 5c7 0 10 7 10 7a17.5 17.5 0 01-3.05 3.89M6.61 6.61A17.74 17.74 0 002 12s3 7 10 7a10.73 10.73 0 004.38-.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        // Eye icon
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
        </svg>
      )}
    </button>
  </div>

  {/* (optional) helper for screen readers; you already enforce minLength */}
  {/* (optional) helper for screen readers; you already enforce minLength */}
  <p id="password-help" className="sr-only">
    Minimum 6 characters.
  </p>
</div>

{/* Forgot password — only in Sign in mode */}
{mode === 'signin' && (
  <div className="mb-3 -mt-1">
    <button
      type="button"
      onClick={handleForgotPassword}
      disabled={disabled}
      className="text-sm text-brown/80 hover:text-brown underline underline-offset-2"
      aria-label="Forgot your password?"
    >
      Forgot your password?
    </button>
  </div>
)}

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
    {/* Guest info modal */}
{showGuestModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* backdrop */}
    <div
      className="absolute inset-0 bg-black/40"
      onClick={() => setShowGuestModal(false)}
      aria-hidden="true"
    />

    {/* dialog */}
    <div
      role="dialog"
      aria-modal="true"
      className="relative w-[92%] max-w-md bg-white rounded-2xl shadow-xl border border-brown/10 p-5"
    >
      <h2 className="text-brown text-lg font-semibold mb-2">Continue as Guest</h2>
      <p className="text-brown/80 text-sm">
        No login is needed to make a booking, but a contact name and number will be required
        to confirm the booking in case the barber needs to contact you.
      </p>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          className="flex-1 h-11 rounded-xl bg-brown text-white font-semibold hover:bg-brown/90"
          onClick={async () => {
            setShowGuestModal(false);
            await proceedGuest();
          }}
        >
          Continue
        </button>
        <button
          type="button"
          className="h-11 rounded-xl px-4 border border-brown/20 text-brown hover:bg-ivory/80"
          onClick={() => setShowGuestModal(false)}
        >
          Back
        </button>
      </div>
    </div>
  </div>
)}

{/* Blocking overlay while Google sign-in is completing */}
{authInProgress && (
  <div
    className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center"
    aria-live="polite"
    aria-busy="true"
    role="status"
  >
    <div className="mx-auto w-[90%] max-w-sm rounded-2xl bg-white border border-brown/10 p-5 shadow-xl text-center">
      <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-brown/20 border-t-brown animate-spin" />
      <p className="text-brown text-sm font-medium">Signing you in…</p>
      <p className="text-brown/70 text-xs mt-1">
        Just a moment while we complete Google sign-in.
      </p>
    </div>
  </div>
)}

    </main>
  );
}