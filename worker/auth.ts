import { constantTimeEqual, hashPassword, signSession, verifySession } from './crypto';
import { json } from './http';

const COOKIE = 'ht_session';
const SESSION_DAYS = 90;

interface UserRow {
  id: number;
  name: string;
  display_name: string;
  pw_salt: string;
  pw_hash: string;
}

function publicUser(u: Pick<UserRow, 'name' | 'display_name'>) {
  return { name: u.name, displayName: u.display_name };
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Returns the logged-in user id, or null. Used by every protected endpoint. */
export async function currentUserId(request: Request, env: Env): Promise<number | null> {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  return verifySession(token, env.SESSION_SECRET, Math.floor(Date.now() / 1000));
}

// Login is password only (owner decision, see docs/HANDOVER.md). The password is checked
// against every user's hash. All hashes are computed, with no early exit, so the response
// time does not show which user matched. Fine for a handful of users.
export async function login(request: Request, env: Env): Promise<Response> {
  let password: unknown;
  try {
    ({ password } = await request.json<{ password?: unknown }>());
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return json({ error: 'invalid_password' }, 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT id, name, display_name, pw_salt, pw_hash FROM users',
  ).all<UserRow>();

  let match: UserRow | null = null;
  for (const user of results) {
    const hash = await hashPassword(password, user.pw_salt);
    if (constantTimeEqual(hash, user.pw_hash) && !match) match = user;
  }
  if (!match) return json({ error: 'invalid_password' }, 401);

  const maxAge = SESSION_DAYS * 24 * 3600;
  const token = await signSession(match.id, Math.floor(Date.now() / 1000) + maxAge, env.SESSION_SECRET);
  return json(publicUser(match), 200, { 'Set-Cookie': sessionCookie(token, maxAge) });
}

export function logout(): Response {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

export async function me(request: Request, env: Env): Promise<Response> {
  const userId = await currentUserId(request, env);
  if (userId === null) return json({ error: 'unauthorized' }, 401);
  const user = await env.DB.prepare('SELECT name, display_name FROM users WHERE id = ?')
    .bind(userId)
    .first<Pick<UserRow, 'name' | 'display_name'>>();
  if (!user) return json({ error: 'unauthorized' }, 401, { 'Set-Cookie': sessionCookie('', 0) });
  return json(publicUser(user));
}
