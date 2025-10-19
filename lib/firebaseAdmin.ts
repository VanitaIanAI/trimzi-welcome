// lib/firebaseAdmin.ts
import { getApps, initializeApp, cert, AppOptions } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Reuse your existing GOOGLE_* envs from .env.local
const projectId  = process.env.GOOGLE_PROJECT_ID;
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  throw new Error('Missing GOOGLE_PROJECT_ID / GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY');
}

const opts: AppOptions = {
  credential: cert({ projectId, clientEmail, privateKey }),
};

const app = getApps().length ? getApps()[0]! : initializeApp(opts);
export const adminDb = getFirestore(app);