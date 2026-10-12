// Password hashing and session signing with WebCrypto only.
// The same code runs in the Worker and in Node (Vitest), so it is tested without a browser.
// scripts/add_user.py produces the same PBKDF2 hashes with Python's hashlib.

export const PBKDF2_ITERATIONS = 100_000; // Workers cap PBKDF2 at 100 000 iterations
const HASH_BYTES = 32;
const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('bad hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function hashPassword(
  password: string,
  saltHex: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    key,
    HASH_BYTES * 8,
  );
  return toHex(new Uint8Array(bits));
}

/** Compares two strings in time that depends only on their length. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Session token: `userId.expiresAtSeconds.signature`. No session table is needed. */
export async function signSession(userId: number, expiresAt: number, secret: string): Promise<string> {
  const payload = `${userId}.${expiresAt}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Returns the user id when the token is valid and not expired, otherwise null. */
export async function verifySession(token: string, secret: string, nowSeconds: number): Promise<number | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(exp)) return null;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = fromBase64Url(sig);
  } catch {
    return null;
  }
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes, encoder.encode(`${id}.${exp}`));
  if (!ok || Number(exp) <= nowSeconds) return null;
  return Number(id);
}
