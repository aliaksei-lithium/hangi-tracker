# Handover: start of the build

## Status on 2026-10-13 (overnight session, run locally)

Done and pushed:
- Phase 0: Vite + Svelte + TS app, Worker with `/api/health`, `wrangler.jsonc`, CI (green).
- Phase 1: D1 migrations, password-only login, session cookie, `scripts/add_user.py`,
  Login, Home greeting, Settings placeholder with Log out. Tested end to end on a local
  Worker (`npm run preview`).
- Phase 2: plan generator with tests, IndexedDB store, real next-session card, preview
  with full editing, scope sheet, Reset to plan, 48 h warning.
- The two open decisions were taken with the design defaults: password-only login,
  square corners. Change either if you want.
- D1 database `hangi-tracker` is created in the account (id in `wrangler.jsonc`).

Waiting for the owner (the session was not allowed to run production deploys):

```
npx wrangler d1 migrations apply hangi-tracker --remote
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
npm run deploy
python3 scripts/add_user.py        # then run the printed command
```

Then open the `workers.dev` URL that `npm run deploy` prints and log in. After the first
real login, check the Worker logs for CPU-limit errors (see PLAN.md, risks).

---


Written 2026-10-12 for the next session. Read this first, then `docs/PLAN.md`.

## Where things are

| What | Where |
| --- | --- |
| Requirements (source of truth for behaviour) | Claude Docs "Hangboard Tracker: Requirements", https://claude.ai/artifact/QhmjJp1pdiKn6tQUdobgnK |
| Build plan: analysis, architecture, stack, phases, setup checklist | `docs/PLAN.md` |
| Design handoff: tokens, screens, assets, design chat | `docs/design/README.md` (start there), `docs/design/tokens.css`, `docs/design/assets/` |
| Brief that produced the design | `docs/DESIGN_PROMPT.md` |
| Branch | `claude/charming-babbage-9duklt` on `aliaksei-lithium/hangi-tracker` |

State of the repo: documentation only. No application code exists yet.

## Environment to verify first

The owner added `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment
variables and allowed `api.cloudflare.com` and `workers.dev` in the network
policy. Verify before anything else:

```
env | grep -c CLOUDFLARE_          # expect 2
npx wrangler whoami                 # expect the account, no login prompt
```

If a variable is missing, say so to the owner and continue with the code work
that needs no deploy (everything in phase 0 except the first deploy).

## Decisions already taken

- Stack: Svelte 5 + Vite + TypeScript, plain CSS from `docs/design/tokens.css`,
  no CSS framework, hand-rolled SVG charts, `idb` for IndexedDB, `vite-plugin-pwa`.
- Server: one Cloudflare Worker serving static assets and `/api/*`, D1 for
  `users` and a per-user JSON snapshot `user_data`. Hand-written router, no framework.
- Auth: signed HttpOnly cookie, 90 days, HMAC-SHA256 with `SESSION_SECRET`.
  Password hashing PBKDF2-SHA256, 100 000 iterations, 16-byte salt.
- Users are created with `scripts/add_user.py` (Python), which prints a
  `wrangler d1 execute` command. No sign-up screen, no admin UI.
- Local store is the working store; the server snapshot syncs after changes
  with a `rev` stale check (409 on conflict). Export and import use the same JSON.
- Timer engine is pure TypeScript computed from timestamps, unit-tested with Vitest.
- Design: timer layout "Flood", phase palette "Signal", background "Topo" on
  login hero and a thin home strip only, pentagon ring icon, Barlow Condensed
  for display and digits, system stack for body text.
- Deploy: Cloudflare Workers Builds on push to `main`, GitHub Actions for
  lint, typecheck and tests. Until the owner connects the repo, deploy with
  `npx wrangler deploy` from the session.

## Two decisions to confirm with the owner at the start

Both came from the owner in the design chat and differ from `docs/PLAN.md`.
Default to the design unless the owner says otherwise.

1. Login is password only (design) instead of name + password (plan). The
   password identifies the user: the Worker checks it against every user's
   hash and the display name for the greeting comes from the matched record.
   Keep the `users` table with `name` and `display_name` so name + password can
   be added later without a migration.
2. Square corners as designed. `--r-1` in `tokens.css` is the only switch.

## First session scope

Do phase 0 and phase 1 from `docs/PLAN.md`:

1. Scaffold: `npm create vite` with the Svelte + TypeScript template, add
   `wrangler.jsonc` (assets directory `dist`, binding `ASSETS`,
   `not_found_handling: single-page-application`, `run_worker_first: ["/api/*"]`),
   `worker/index.ts` with `/api/health`, D1 binding, `.dev.vars` in `.gitignore`.
2. Copy `docs/design/tokens.css` to `src/app.css`, add the dark block for
   "system", keep the Google Fonts import.
3. CI workflow: install, lint, typecheck, `vitest run`.
4. D1: `wrangler d1 create hangi-tracker`, migrations `0001_users.sql` and
   `0002_user_data.sql`, apply remotely. Set `SESSION_SECRET` with
   `wrangler secret put`.
5. Auth endpoints, `scripts/add_user.py`, login screen, home screen with the
   greeting ("Good evening, Aliaksei", time-of-day aware) and a placeholder
   next-session card styled from the design.
6. Deploy, open the `workers.dev` URL, log in once with a user the owner
   creates, confirm the greeting. Report the URL and what remains.

Done means: the app is live, only a known password gets in, the greeting shows
the display name, CI is green, and the plan is updated if anything changed.

## Conventions

- Commit small, push to the same branch, do not open a pull request unless asked.
- Keep dependencies few. Prefer writing a small function over adding a package.
- Scripts in Python. Owner's primary languages are Java and Kotlin, so explain
  TypeScript-specific choices briefly when they are not obvious.
- Do not put model names in commits, code or comments.
- Owner reads English as a non-native speaker. Short sentences, no slang.
- Owner wants a working app fast. If a decision is routine, take it and note
  it in the commit message. Ask only when a wrong guess would cost a rewrite.

## Kickoff prompt for the new session

```
Read docs/HANDOVER.md on branch claude/charming-babbage-9duklt, then docs/PLAN.md
and docs/design/README.md. Verify Cloudflare access as the handover describes.
Confirm the two open decisions with me in one short message, then start phase 0
and phase 1 and push as you go.
```
