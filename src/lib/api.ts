// Thin client for the Worker API. The session lives in an HttpOnly cookie,
// so the app never sees or stores a token.

export interface User {
  name: string;
  displayName: string;
}

/** Thrown when the server cannot be reached (offline, DNS, Worker down). */
export class NetworkError extends Error {}

async function call(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new NetworkError('network');
  }
}

/** Returns the logged-in user, or null when there is no valid session. */
export async function fetchMe(): Promise<User | null> {
  const res = await call('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`me: ${res.status}`);
  return res.json();
}

/** Returns the user on success, or null when the password is wrong. */
export async function login(password: string): Promise<User | null> {
  const res = await call('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`login: ${res.status}`);
  return res.json();
}

export async function logout(): Promise<void> {
  await call('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}

/** Thrown when the session cookie is no longer valid. */
export class UnauthorizedError extends Error {}

export interface ServerData {
  rev: number;
  doc: unknown;
  updatedAt: string | null;
}

export async function getData(): Promise<ServerData> {
  const res = await call('/api/data');
  if (res.status === 401) throw new UnauthorizedError('unauthorized');
  if (!res.ok) throw new Error(`data: ${res.status}`);
  return res.json();
}

/** Returns the new rev, or a conflict with the server's current rev. */
export async function putData(baseRev: number, doc: unknown): Promise<{ ok: true; rev: number } | { ok: false; rev: number }> {
  const res = await call('/api/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseRev, doc }),
  });
  if (res.status === 401) throw new UnauthorizedError('unauthorized');
  if (res.status === 409) return { ok: false, rev: (await res.json()).rev };
  if (!res.ok) throw new Error(`data: ${res.status}`);
  return { ok: true, rev: (await res.json()).rev };
}
