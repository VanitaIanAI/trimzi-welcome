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
  // In Firebase/Cloud: use Application default Credentials (no JSON file needed)
  if (process.env.GCLOUD_PROJECT || process.env.FUNCTIONS_EMULATOR) {
    const auth = new google.auth.GoogleAuth({ scopes: SCOPES });
    return await auth.getClient();
   
  }

  // Local dev: load the downloaded service account JSON from /config
  const keyPath = path.join(process.cwd(), 'config', 'service-account-key.json');
  const { client_email, private_key } = JSON.parse(readFileSync(keyPath, 'utf8'));
  
  return new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES,
    
});
}  


export async function getCalendar() {
  const auth = await getAuth();
  return google.calendar({ 
    version: 'v3', 
    auth: auth as any,

   });
}

export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'vanitaian24@gmail.com';
export const TZ = process.env.TIMEZONE || 'Europe/London';
