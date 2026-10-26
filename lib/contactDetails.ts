// Shared format validation only; this does not verify identity or ownership.
export type BookingContact = { name: string; phone: string; email: string };

export function trimmedContact(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function firstContactName(...values: unknown[]): string {
  return values.map(trimmedContact).find(Boolean) || '';
}

export function normalizeUKMobile(value: unknown): string | null {
  const raw = trimmedContact(value);
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  const phone = raw.replace(/[^\d+]/g, '');
  if (/^\+447\d{9}$/.test(phone)) return phone;
  if (/^07\d{9}$/.test(phone)) return phone.replace(/^0/, '+44');
  return null;
}

export function validContactEmail(value: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact(value));
}

export function firstContactEmail(...values: unknown[]): string {
  return values.map(trimmedContact).find(validContactEmail) || '';
}

export function savedBookingContact(
  profile: { name?: unknown; phone?: unknown; email?: unknown },
  account: { displayName?: unknown; email?: unknown }
): BookingContact {
  return {
    name: firstContactName(profile.name, account.displayName),
    phone: trimmedContact(profile.phone),
    email: firstContactEmail(account.email, profile.email),
  };
}

export function validateBookingContact(raw: { name?: unknown; phone?: unknown; email?: unknown }):
  | { ok: true; contact: BookingContact }
  | { ok: false; error: string } {
  const name = trimmedContact(raw.name);
  if (!name) return { ok: false, error: 'Please enter your name.' };
  const phone = normalizeUKMobile(raw.phone);
  if (!phone) return { ok: false, error: 'Please enter a valid UK mobile number (07XXXXXXXXX or +447XXXXXXXXX).' };
  const email = trimmedContact(raw.email);
  if (!validContactEmail(email)) return { ok: false, error: 'Please enter a valid email address.' };
  return { ok: true, contact: { name, phone, email } };
}

// A later sign-in must not erase or replace a customer-supplied profile name.
export function signInContactPatch(
  existing: { name?: unknown; phone?: unknown; email?: unknown },
  incoming: { name?: unknown; phone?: unknown; email?: unknown } = {}
): Partial<BookingContact> {
  const patch: Partial<BookingContact> = {};
  const name = firstContactName(existing.name, incoming.name);
  const phone = firstContactName(existing.phone, incoming.phone);
  const email = firstContactEmail(existing.email, incoming.email);
  if (name) patch.name = name;
  if (phone) patch.phone = phone;
  if (email) patch.email = email;
  return patch;
}
