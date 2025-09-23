// lib/googleCalendar.ts
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
* Use Application Default Credentials in Firebase/Cloud,
* and fall back to the local JSON key when running locally.
*/
async function getAuth() {
  // In Firebase Hosting/Functions, GCLOUD_PROJECT is set
  if (process.env.GCLOUD_PROJECT || process.env.FUNCTIONS_EMULATOR) {
    const auth = new google.auth.GoogleAuth({ scopes: SCOPES });
    return await auth.getClient();
  }

  // Local dev: use the key in /config/service-account-key.json
  const keyPath = path.join(process.cwd(), 'config', 'service-account-key.json');
  const keyFile = JSON.parse(readFileSync(keyPath, 'utf8'));
  return new google.auth.JWT(
    keyFile.client_email,
    undefined,
    keyFile.private_key,
    SCOPES
  );
}

export async function getCalendar() {
  const auth = await getAuth();
  return google.calendar({ version: 'v3', auth });
}

export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'vanitaian24@gmail.com';
export const TZ = process.env.TIMEZONE || 'Europe/London';
