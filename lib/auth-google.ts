// lib/auth-google.ts
'use client';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export async function signInWithGoogle() {
  const res = await signInWithPopup(auth, googleProvider);
  const u = res.user;
  await setDoc(
    doc(db, 'users', u.uid),
    {
      uid: u.uid,
      email: u.email ?? null,
      displayName: u.displayName ?? '',
      photoURL: u.photoURL ?? '',
      onboardingCompleted: true,
      lastLoginAt: serverTimestamp(),
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}
