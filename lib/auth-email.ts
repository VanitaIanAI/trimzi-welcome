// lib/auth-email.ts
'use client';
import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export async function emailSignInOrUp(email: string, password: string) {
  try {
    const r = await signInWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', r.user.uid), {
      lastLoginAt: serverTimestamp(),
      onboardingCompleted: true
    }, { merge: true });
  } catch (e: any) {
    if (e?.code === 'auth/user-not-found') {
      const r = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', r.user.uid), {
        uid: r.user.uid,
        email,
        displayName: '',
        photoURL: '',
        onboardingCompleted: true,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      }, { merge: true });
    } else {
      throw e;
    }
  }
}
