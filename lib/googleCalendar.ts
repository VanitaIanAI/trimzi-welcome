// lib/googleCalendar.ts
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getJwtClient() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY');
  return new google.auth.JWT({ email, key, scopes: SCOPES });
}

export function getCalendar() {
  const auth = getJwtClient();
  return google.calendar({ version: 'v3', auth });
}

// keep these as you had them
export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'vanitaian24@gmail.com';
export const TZ = process.env.TIMEZONE || 'Europe/London';
