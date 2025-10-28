import crypto from 'crypto';

const SECRET = process.env.CANCEL_TOKEN_SECRET!;
const EXPIRES_HOURS = 24;

export function signCancelToken(payload: { eventId: string; uid?: string }) {
  const data = { ...payload, exp: Date.now() + EXPIRES_HOURS * 3600_000 };
  const base = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(base).digest('base64url');
  return `${base}.${sig}`;
}

export function verifyCancelToken(token: string) {
  try {
    const [base, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(base).digest('base64url');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(base, 'base64url').toString());
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}