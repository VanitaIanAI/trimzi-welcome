// lib/assertEnv.ts
export function assertEnv(...names: string[]) {
  const missing = names.filter(n => !process.env[n]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
