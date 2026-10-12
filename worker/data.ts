// Per-user JSON snapshot. The app's local store is the working copy; this is the
// server copy for a second device and for backup. `rev` increases on every write.
// A write must name the rev it was based on; if another device wrote in between,
// the write gets 409 and the app asks the user before replacing anything.

import { currentUserId } from './auth';
import { json } from './http';

const MAX_DOC_BYTES = 2_000_000; // years of sessions fit in a few hundred kilobytes

export async function getData(request: Request, env: Env): Promise<Response> {
  const userId = await currentUserId(request, env);
  if (userId === null) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT doc, rev, updated_at FROM user_data WHERE user_id = ?')
    .bind(userId)
    .first<{ doc: string; rev: number; updated_at: string }>();
  if (!row) return json({ rev: 0, doc: null, updatedAt: null });
  return json({ rev: row.rev, doc: JSON.parse(row.doc), updatedAt: row.updated_at });
}

export async function putData(request: Request, env: Env): Promise<Response> {
  const userId = await currentUserId(request, env);
  if (userId === null) return json({ error: 'unauthorized' }, 401);

  const text = await request.text();
  if (text.length > MAX_DOC_BYTES) return json({ error: 'too_large' }, 413);
  let body: { baseRev?: unknown; doc?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const { baseRev, doc } = body;
  if (typeof baseRev !== 'number' || !Number.isInteger(baseRev) || baseRev < 0 || typeof doc !== 'object' || doc === null) {
    return json({ error: 'bad_request' }, 400);
  }
  const docText = JSON.stringify(doc);

  // The rev check and the write are one statement, so two devices cannot both win.
  const result =
    baseRev === 0
      ? await env.DB.prepare('INSERT INTO user_data (user_id, doc, rev) VALUES (?, ?, 1) ON CONFLICT(user_id) DO NOTHING')
          .bind(userId, docText)
          .run()
      : await env.DB.prepare(
          "UPDATE user_data SET doc = ?, rev = rev + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ? AND rev = ?",
        )
          .bind(docText, userId, baseRev)
          .run();

  if (result.meta.changes === 0) {
    const current = await env.DB.prepare('SELECT rev FROM user_data WHERE user_id = ?').bind(userId).first<{ rev: number }>();
    return json({ error: 'conflict', rev: current?.rev ?? 0 }, 409);
  }
  return json({ rev: baseRev + 1 });
}
