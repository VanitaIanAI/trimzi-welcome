// lib/firebaseClient.ts
import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// DO NOT THROW in the browser – just read what's available.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FB_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FB_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID,
};

// Log once if something is missing, but don't crash the app.
if (
  !firebaseConfig.apiKey ||
  !firebaseConfig.authDomain ||
  !firebaseConfig.projectId ||
  !firebaseConfig.appId
) {
  // This shows you exactly what's missing in the browser console.
  // It keeps the UI alive so you can still use the email flow, etc.
  console.error('Missing Firebase env vars in client bundle:', firebaseConfig);
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Guarded to avoid build/runtime hiccups if the method isn't present in your SDK/env
try {
  (googleProvider as any).setCustomParameters?.({ prompt: 'select_account' });
} catch {}

export default app;