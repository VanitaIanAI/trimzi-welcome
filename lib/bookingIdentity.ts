import { adminAuth } from '@lib/firebaseAdmin';

export async function bookingIdentity(req: Request, required = true): Promise<string | null> {
  const header = req.headers.get('authorization');
  if (!header && !required) return null;
  if (!header?.startsWith('Bearer ')) throw Object.assign(new Error('Please sign in again.'), { status: 401, diaryStatus: 401 });
  try {
    const decoded = await adminAuth.verifyIdToken(header.slice(7));
    if (!decoded.uid || decoded.firebase?.sign_in_provider === 'anonymous') {
      throw new Error('A registered account is required.');
    }
    return decoded.uid;
  } catch {
    throw Object.assign(new Error('Please sign in again.'), { status: 401, diaryStatus: 401 });
  }
}
