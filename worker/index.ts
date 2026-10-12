// One Worker serves the built app (static assets) and the JSON API under /api/*.
// wrangler.jsonc routes only /api/* here first; every other path goes to the assets.
import { login, logout, me } from './auth';
import { json } from './http';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    // State-changing calls must send JSON. A plain HTML form cannot, which blocks
    // cross-site form posts on top of the SameSite=Lax cookie.
    if (request.method === 'POST' && !request.headers.get('Content-Type')?.startsWith('application/json')) {
      return json({ error: 'unsupported_media_type' }, 415);
    }

    const route = `${request.method} ${url.pathname}`;
    switch (route) {
      case 'GET /api/health':
        return json({ ok: true });
      case 'POST /api/login':
        return login(request, env);
      case 'POST /api/logout':
        return logout();
      case 'GET /api/me':
        return me(request, env);
      default:
        return json({ error: 'not_found' }, 404);
    }
  },
} satisfies ExportedHandler<Env>;
