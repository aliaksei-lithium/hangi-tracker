# Hangi Tracker: build plan

Plan date: 2026-10-12. Source: the requirements doc "Hangboard Tracker: Requirements" (rev 14).

## 1. What we are building

A mobile-first PWA for hangboard training, deployed on Cloudflare, behind a simple
password login. The user opens it, gets greeted by name, sees the next
session ready, taps Start, puts the phone on the floor and hangs. Results are
saved and shown in progress views.

## 2. Analysis: requirements vs. the new asks

The requirements doc says "no backend, no accounts, data stays on the device".
The new asks are "deploy to Cloudflare" and "simple password login with a name,
more users later". These are reconciled like this:

| Topic | Requirements doc | Decision for v1 |
| --- | --- | --- |
| Hosting | PWA, offline | Cloudflare Worker serves the PWA as static assets and a tiny JSON API under `/api/*`. |
| Accounts | none | Minimal login: password only (design default, taken 2026-10-13; the owner can still change it). Users keep a `name` so name + password can be added later. Users are created by a script, not by a sign-up form. |
| Data | IndexedDB on device, "allow sync later" | IndexedDB stays the working store (timer and log work offline). The Worker keeps a per-user snapshot in D1 and syncs it. This is the "sync later" done minimally now. |
| Multi-user | out of scope | The data is namespaced by user from day one, so adding users is only running the script. No admin UI. |
| Greeting | not mentioned | Home screen greets by display name, with a time-of-day line and the next session. |

Everything else in the doc stays as written: 8-week plan, two sessions a week,
timer with buffer times, summary, progress views, suggestions, settings, export
and import, acceptance criteria.

Things the doc leaves to the developer, decided here:

- IndexedDB library: the tiny `idb` wrapper, not Dexie. The data is small and the
  schema is five object stores. Dexie adds little here.
- Sound with locked screen: Web Audio API with an `AudioContext` unlocked on the
  Start tap, beeps scheduled on the audio clock, plus a silent looping audio
  element with Media Session metadata so iOS keeps the audio session alive.
  Vibration API on Android. This is "as far as the browser allows"; iOS may
  still suspend audio in some cases, and that is documented in the app.
- Plan storage: a generated list of planned sessions (as the doc's data model
  says), plus the rules in settings. A "regenerate from week N" function
  rebuilds future sessions after an accepted suggestion or an "all next
  sessions" edit.

## 3. Architecture

```
Phone (PWA)                                  Cloudflare
+------------------------------+             +------------------------------+
| Svelte 5 app (Vite, TS)      |   HTTPS     | Worker (TypeScript)          |
|  screens: login, home,       | <---------> |  /api/login, /api/logout     |
|  preview, timer, summary,    |             |  /api/me                     |
|  progress, settings          |             |  /api/data (GET, PUT)        |
|  domain: plan, timer engine, |             |  everything else -> ASSETS   |
|  suggestions (pure TS)       |             |        |                     |
|  store: IndexedDB (idb)      |             |        v                     |
|  sync: snapshot push/pull    |             |  D1: users, user_data        |
|  service worker (offline)    |             |  secret: SESSION_SECRET      |
+------------------------------+             +------------------------------+
```

### Stack

| Part | Choice | Why |
| --- | --- | --- |
| UI | Svelte 5 + Vite + TypeScript | Allowed by the doc, smallest runtime, good for a timer UI. |
| Styling | plain CSS with custom properties (design tokens from the Design Agent) | No CSS framework dependency. |
| Charts | hand-rolled SVG components | Three simple charts; a chart library is not worth the bytes. |
| Local store | IndexedDB via `idb` | Tiny wrapper, typed stores. |
| PWA | `vite-plugin-pwa` (Workbox) | Precaches the app shell; `/api/*` is network-only. |
| Server | Cloudflare Worker with static assets, `run_worker_first: ["/api/*"]`, `not_found_handling: single-page-application` | One deploy unit, no Pages. |
| Database | Cloudflare D1 (SQLite) | Free tier is more than enough; SQL migrations in the repo. |
| Routing in the Worker | hand-written `switch` on path and method | Four endpoints; no framework. |
| Tests | Vitest for domain logic, Playwright for one smoke flow | Timer and plan logic must be tested without a browser. |
| Deploy | Cloudflare Workers Builds connected to the GitHub repo, branch `main` | Push to `main` deploys. GitHub Actions runs lint, typecheck and tests on every push. |
| User admin | `scripts/add_user.py` | Python, per preference. Generates the password hash and prints the `wrangler d1 execute` command. |

### Auth design

- `users` table: `id`, `name` (unique, lower-cased), `display_name`, `pw_salt`,
  `pw_hash`, `created_at`. Password hashing: PBKDF2-SHA256, 100 000 iterations,
  16-byte salt. The same algorithm is available in Python's `hashlib` and in
  WebCrypto on Workers, so the script and the Worker agree.
- `POST /api/login` with `{password}`. Login is password only (design default,
  taken at the start of the build). The Worker hashes the password with every
  user's salt and compares in constant time, without an early exit, so the timing
  does not show which user matched. Every user therefore needs a different
  password. On success it sets an `HttpOnly; Secure; SameSite=Lax` cookie
  `ht_session`. The value is `userId.expiry.signature`, signed with HMAC-SHA256
  and `SESSION_SECRET`. No session table. Lifetime 90 days.
- POST requests must have `Content-Type: application/json`, so a cross-site HTML
  form cannot post to the API.
- `GET /api/me` returns `{name, displayName}`. `POST /api/logout` clears the cookie.
- A wrong password gives one generic error. The slow hash is the
  brute-force defence for v1. Cloudflare's rate-limiting binding can be added
  later without touching the app.
- Offline: the app keeps the last known user in IndexedDB and works. Sync
  resumes when the network is back; a 401 sends the user to the login screen.

### Data and sync

- IndexedDB stores: `plan`, `plannedSessions`, `hangSessions`, `settings`, `meta`.
  These follow the data model sketch in the requirements doc.
- Server side, v1 keeps one row per user in `user_data`: `user_id`, `doc`
  (JSON of all stores), `rev`, `updated_at`. The doc is a few hundred kilobytes
  at most after years of two sessions a week.
- `GET /api/data` returns `{rev, doc}`. `PUT /api/data` sends `{baseRev, doc}`
  and gets `409` if `baseRev` is stale. On 409 the app pulls, shows "newer data
  on the server, reload?", and never silently overwrites.
- Pushes are debounced (2 s after the last change) and always sent after a
  session is saved. The pull happens on login and on app open.
- JSON export and import use the same doc format as the snapshot, so one
  serializer serves both.
- Upgrade path when needed: per-entity rows and a change log. Not in v1.

### Timer engine

- Pure TypeScript state machine: phases `countdown`, `warmup`, `hang`, `rest`,
  `prepare`, `done`. Input is a session spec; output is `phaseAt(now)`.
- Time comes from timestamps. The UI ticks with `requestAnimationFrame` while
  visible and recomputes from timestamps on `visibilitychange`, so a hidden tab
  never drifts.
- Signals are scheduled on the Web Audio clock a few seconds ahead. After a
  resume, missed signals are skipped and the current phase is announced once.
- Wake Lock is requested on Start and re-requested on `visibilitychange`.
- Controls: pause, resume, +10 s (countdown and rest), skip phase, finish early
  with confirmation. During rest, one tap marks the last set "Completed" or
  "Failed at second N"; the default is completed.

## 4. Repository layout

```
hangi-tracker/
  docs/                 PLAN.md, DESIGN_PROMPT.md, later ADRs
  src/                  Svelte app
    lib/domain/         plan generator, timer engine, suggestion rules (pure TS, tested)
    lib/store/          IndexedDB access, sync client, export/import
    lib/audio/          signals, voice prompts, wake lock
    lib/i18n/           en.json, ru.json
    lib/ui/             shared components (buttons, cards, number steppers)
    routes/             Login, Home, Preview, Timer, Summary, Progress, Settings
  worker/               Cloudflare Worker: index.ts, auth.ts, data.ts, db.ts
  migrations/           0001_users.sql, 0002_user_data.sql
  scripts/add_user.py   creates a user (prints the D1 insert command)
  tests/                Vitest unit tests; e2e/ for Playwright
  wrangler.jsonc, vite.config.ts, package.json, tsconfig.json
  .github/workflows/ci.yml
```

## 5. Phases

Each phase ends with a deployable app. Phases 1 to 3 are the minimum useful
product: log in, be greeted, run a session.

| # | Phase | Delivers | Done when |
| --- | --- | --- | --- |
| 0 | Scaffold and deploy | Vite + Svelte + TS app, Worker with `/api/health` and static assets, `wrangler.jsonc`, CI workflow, first manual `wrangler deploy`, Workers Builds connected to `main`. | The empty app is live on a `workers.dev` URL and a push to `main` redeploys it. |
| 1 | Login and greeting | D1 migrations, `add_user.py`, login/logout/me endpoints, login screen, home screen with "Good evening, Aliaksei" and a placeholder next-session card. | Only a known user gets in; the greeting shows the display name. |
| 2 | Plan and preview | Data model, default 8-week plan generator, IndexedDB store, next-session card, preview with full editing, scope prompt (this session or all next of this type), reset to plan, 48 h warning. | Acceptance criteria 1 and 2. |
| 3 | Timer | Timer engine with tests, timer screen, signals, voice prompts, wake lock, controls, set results, summary screen with auto-save. | Acceptance criteria 3 and 4. |
| 4 | Log and sync | Session log with manual entry, edit, delete; snapshot sync with D1; offline behaviour; JSON export and import. | Acceptance criteria 5, 7 and 8. |
| 5 | Progress views | Week table, three SVG charts, personal records, calendar, plan vs actual. | Views fill from the log without input. |
| 6 | Suggestions and safety | Smaller-edge, step-back and missed-weeks rules with Accept and Dismiss; pain threshold; safety message; plan regeneration. | Acceptance criterion 6. |
| 7 | Settings and polish | All settings groups, units, theme, Russian and English, PWA install prompt, accessibility pass, Playwright smoke test. | Installable, offline, readable at 2 m. |
| D | Design integration | Tokens, components and screens from the design handoff in `docs/design/` (see its README). `tokens.css` becomes the app's CSS base in phase 0; screens are rebuilt in Svelte as each phase reaches them. | Screens match the design board. |

## 5a. Decisions taken during the build

- Phase 2: where the requirements give a range, the middle is used (full rest 2:30;
  light sessions 3 sets in weeks 1-4, 4 sets in weeks 5-8). Week 1 starts on the first
  full-session day on or after the day the plan is created.
- "This and all next" changes the plan (2026-10-14): the edited session's values become
  its plan values, later open sessions of the same type get the change in their plan,
  and "Reset to plan", a new schedule and "repeat last week" keep it. "Only this
  session" stays a one-off change. "Train now" uses the next session's current values.
- "This and all next" carries only session-wide changes to later sessions of the same
  type. Hang time and set count carry as a difference, so the progression keeps its
  shape; edge, rest, grip and weight carry as the value. A change to one set stays local.
- A missed session stays the next session (marked overdue) until it is done or skipped.
- Lint is `svelte-check --fail-on-warnings` (no ESLint, fewer dependencies).
- Phase 3: the start countdown, prepare and warm-up rest are settings; prepare is
  taken from the end of the rest. Beeps for the whole session are scheduled on the
  Web Audio clock and rescheduled after pause, +10 s and skip.
- Phase 4: the log lives under the Progress tab. A log entry can link to one planned
  session; saving marks it done, deleting opens it again.
- Phase 5: edge and hang time are two charts (the design had one chart with two
  y-scales). Two-series colours were checked with a palette validator.
- Phase 6: a planned session stores its plan values after an accepted suggestion
  (`baseSets`), so "Reset to plan" keeps the suggestion. Handled suggestions are kept
  in `plan.handled`. "Repeat last week" adds one week at the end.
- Phase 7: sub-screens use browser history for the back gesture.
- Guest mode: "Try it without an account" opens the app with sample data in a
  separate local database, with no server calls. A shared demo password was rejected
  (visitors would overwrite each other's data). Open registration would need name +
  password login, Turnstile and rate limits; not built.
- Weekly schedule: any set of weekdays, each full or light (one session per day).
  A plan week is a 7-day block from the first full day. A new schedule keeps done
  sessions, keeps the open sessions of a started week on new dates, and rebuilds the
  later weeks; accepted-suggestion values are carried over, one-off edits are not.

## 6. Setup checklist (one-time, by the owner)

Status on 2026-10-13: steps 1 and 2 are done.

1. Cloudflare account, `npx wrangler login`. Done.
2. `wrangler d1 create hangi-tracker`. Done, the id is in `wrangler.jsonc`.
3. `npx wrangler d1 migrations apply hangi-tracker --remote`.
4. `npx wrangler secret put SESSION_SECRET` (any long random string, for example `openssl rand -hex 32`).
5. `npm run deploy` (builds and runs `wrangler deploy`).
6. `python3 scripts/add_user.py` and run the printed command to create the first user.
7. In the Cloudflare dashboard, connect the Worker to the GitHub repo (Workers Builds, branch `main`, build `npm run build`, deploy `npx wrangler deploy`).

Local development: copy `.dev.vars.example` to `.dev.vars`, run
`npx wrangler d1 migrations apply hangi-tracker --local`, create a user with
`python3 scripts/add_user.py --local`, then `npm run preview` (build + local Worker
on port 8787). For hot reload run `npm run dev:worker` and `npm run dev` together;
Vite proxies `/api` to port 8787.

## 7. Risks and open points

- PBKDF2 with 100 000 iterations costs tens of milliseconds of CPU per user on
  each login. The Workers free plan allows 10 ms CPU per request. Check the first
  real logins in the Worker logs; if they hit the limit, use the paid plan or
  lower the iterations for new hashes (store the count per user).

- iOS audio with the screen locked is the main technical risk. Phase 3 includes
  a real-device test on iPhone and Android before the rest of the timer polish.
- The 48 h rule, the pain threshold and the "all next sessions" edit all touch
  plan regeneration. The generator is written once, with tests, and reused.
- Snapshot sync is last-write-wins with a stale check. Fine for one person on
  one or two devices; not fine for concurrent edits. Documented as a v1 limit.
- Design assets (background graphic, icons) must stay small so the PWA shell
  loads fast on the gym Wi-Fi. Budget: 30 KB for the background SVG.
