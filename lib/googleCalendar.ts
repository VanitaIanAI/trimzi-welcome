// lib/googleCalendar.ts
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import path from 'path';

const keyPath = path.join(process.cwd(), 'config', 'service-account-key.json');
const keyFile = JSON.parse(readFileSync(keyPath, 'utf8'));

// Use a Service Account JWT client for server-to-server
const jwt = new google.auth.JWT({
  email: keyFile.client_email,
  key: keyFile.private_key,
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

export function getCalendar() {
  const calendar = google.calendar({ version: 'v3', auth: jwt });
  return calendar;
}

export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
export const TZ = process.env.TIMEZONE || 'Europe/London';
