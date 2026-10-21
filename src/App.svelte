<script lang="ts">
  import { fetchMe, logout, NetworkError, type User } from './lib/api';
  import { addDays, toIsoDate } from './lib/domain/dates';
  import { newEntry, plannedChangesOnDelete, plannedChangesOnSave } from './lib/domain/log';
  import { nextSession, resetToPlan, saveEdit, skipSessions } from './lib/domain/plan';
  import type { EditScope, HangSession, PlannedSession, ScheduleDay, Settings } from './lib/domain/types';
  import ScheduleSheet from './lib/ui/ScheduleSheet.svelte';
  import { Store, type Snapshot } from './lib/store/db';
  import { demoContent } from './lib/domain/demo';
  import { DocError, parseDoc, toDoc } from './lib/store/doc';
  import { Sync, type SyncStatus } from './lib/store/sync';
  import { applySchedule, extraSession, findSuggestions, moveSession, moveToEdge, restartAfterBreak, skipNext, stepBack, type Suggestion } from './lib/domain/suggest';
  import type { SuggestionAction } from './lib/ui/SuggestionCard.svelte';
  import EntryEditor from './routes/EntryEditor.svelte';
  import Home from './routes/Home.svelte';
  import Progress from './routes/Progress.svelte';
  import Login from './routes/Login.svelte';
  import Preview from './routes/Preview.svelte';
  import SettingsView from './routes/Settings.svelte';
  import Summary from './routes/Summary.svelte';
  import Timer, { type TimerOutcome } from './routes/Timer.svelte';

  type View =
    | { name: 'home' }
    | { name: 'log' }
    | { name: 'settings' }
    | { name: 'preview'; id: string; extra?: PlannedSession }
    | { name: 'timer'; id: string; extra?: PlannedSession }
    | { name: 'summary'; id: string }
    | { name: 'entry'; entry: HangSession; isNew: boolean };

  // The last user is kept so the app opens offline. It holds only the name.
  const LAST_USER = 'hangi-tracker:lastUser';
  // Guest mode: no account, sample data, everything stays in this browser.
  const GUEST = 'hangi-tracker:guest';
  // "~" cannot appear in a real login name, so the guest database never clashes.
  const GUEST_USER: User = { name: '~guest', displayName: 'Guest' };

  let user = $state<User | null>(null);
  let checked = $state(false);
  let offlineNoUser = $state(false);
  let view = $state<View>({ name: 'home' });
  let data = $state<Snapshot | null>(null);
  let syncStatus = $state<SyncStatus>('idle');
  let syncedAt = $state<string | null>(null);
  let store: Store | null = null;
  let sync: Sync | null = null;
  let guest = $state(false);

  function readLastUser(): User | null {
    try {
      return JSON.parse(localStorage.getItem(LAST_USER) ?? 'null');
    } catch {
      return null;
    }
  }

  async function check() {
    offlineNoUser = false;
    try {
      const u = await fetchMe();
      if (u) await enter(u, true);
      else {
        localStorage.removeItem(LAST_USER);
        if (localStorage.getItem(GUEST)) await enterGuest();
      }
    } catch (e) {
      if (!(e instanceof NetworkError)) throw e;
      const last = readLastUser();
      if (localStorage.getItem(GUEST)) await enterGuest();
      else if (last) await enter(last, false);
      else offlineNoUser = true;
    } finally {
      checked = true;
    }
  }
  check();

  async function enter(u: User, online: boolean) {
    leave();
    guest = false;
    localStorage.removeItem(GUEST);
    localStorage.setItem(LAST_USER, JSON.stringify(u));
    store = await Store.open(u.name);
    sync = new Sync(store, {
      status: (s) => {
        syncStatus = s;
        if (s === 'idle') void store?.getMeta().then((m) => (syncedAt = m.syncedAt));
      },
      replaced: () => void reload(),
      unauthorized: () => {
        leave();
        user = null;
      },
    });
    // Pull first: on a new device the server data must arrive before a default plan is made.
    if (online) await sync.pull();
    else syncStatus = 'offline';
    data = await store.load();
    syncedAt = (await store.getMeta()).syncedAt;
    user = u;
    view = { name: 'home' };
  }

  /** Guest mode: a local store with sample data on first use, and no server sync. */
  async function enterGuest() {
    leave();
    localStorage.setItem(GUEST, '1');
    store = await Store.open(GUEST_USER.name);
    const empty = await store.snapshot().then(() => false, () => true);
    if (empty) await store.replaceAll(demoContent(toIsoDate(new Date())), { rev: 0 });
    data = await store.load();
    guest = true;
    syncStatus = 'idle';
    user = GUEST_USER;
    view = { name: 'home' };
  }

  function leave() {
    sync?.stop();
    store?.close();
    sync = null;
    store = null;
    data = null;
  }

  async function reload() {
    if (store) data = await store.load();
  }

  async function doLogout() {
    if (guest) {
      // The guest data stays in this browser for next time.
      localStorage.removeItem(GUEST);
      guest = false;
      leave();
      user = null;
      return;
    }
    await logout().catch(() => {});
    localStorage.removeItem(LAST_USER);
    leave();
    user = null;
  }

  // ---- plan ----

  async function saveSession(draft: PlannedSession, scope: EditScope, remember: boolean) {
    if (!data || !store) return;
    const before = $state.snapshot(data.sessions);
    const after = saveEdit(before, draft, scope, $state.snapshot(data.settings));
    const changed = after.filter((s, i) => s !== before[i]);
    await store.saveSessions(changed);
    data.sessions = after;
    if (remember) await changeSettings({ ...$state.snapshot(data.settings), rules: { ...$state.snapshot(data.settings.rules), editScope: scope } });
  }

  async function resetSession(id: string) {
    if (!data || !store) return;
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return;
    const reset = resetToPlan($state.snapshot(s), $state.snapshot(data.settings));
    await store.saveSessions([reset]);
    data.sessions = data.sessions.map((x) => (x.id === id ? reset : x));
  }

  async function moveDate(id: string, date: string, shiftNext: boolean) {
    if (!data || !store) return;
    const before = $state.snapshot(data.sessions);
    const after = moveSession(before, id, date, shiftNext);
    await store.saveSessions(after.filter((x, i) => x !== before[i]));
    data.sessions = after;
  }

  // Skipping, with a short Undo.
  let undoSkip = $state<{ before: PlannedSession[]; text: string } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  async function skip(ids: string[]) {
    if (!data || !store) return;
    const before = $state.snapshot(data.sessions);
    const after = skipSessions(before, ids);
    const changed = after.filter((x, i) => x !== before[i]);
    if (!changed.length) return;
    await store.saveSessions(changed);
    data.sessions = after;
    undoSkip = {
      before: before.filter((x) => changed.some((c) => c.id === x.id)),
      text: changed.length === 1 ? 'Session skipped.' : `${changed.length} sessions skipped.`,
    };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (undoSkip = null), 10_000);
  }

  async function undoLastSkip() {
    if (!data || !store || !undoSkip) return;
    // A plain copy: IndexedDB cannot store Svelte's reactive proxies.
    const restore = $state.snapshot(undoSkip.before);
    undoSkip = null;
    clearTimeout(undoTimer);
    await store.saveSessions(restore);
    data.sessions = data.sessions.map((s) => restore.find((r) => r.id === s.id) ?? s);
  }

  function openExtra(type: 'full' | 'light') {
    if (!data) return;
    const s = extraSession($state.snapshot(data.sessions), $state.snapshot(data.settings), type, toIsoDate(new Date()));
    go({ name: 'preview', id: s.id, extra: s });
  }

  // ---- log ----

  function lastBodyweight(): number | null {
    if (!data) return null;
    const withWeight = data.hangSessions.filter((s) => s.bodyweightKg !== null);
    withWeight.sort((a, b) => b.datetime.localeCompare(a.datetime));
    return withWeight[0]?.bodyweightKg ?? null;
  }

  /** Saves the session as soon as the timer ends, before the summary opens. */
  async function timerDone(planned: PlannedSession, o: TimerOutcome, extra: boolean) {
    if (!data || !store) return;
    // An extra session is logged without a plan link and leaves the plan as it is.
    const session: HangSession = {
      ...newEntry(null, new Date(o.startedAt).toISOString(), crypto.randomUUID()),
      plannedId: extra ? null : planned.id,
      type: planned.type,
      week: extra ? null : planned.week,
      durationSec: o.durationSec,
      plannedSets: o.plannedSets,
      sets: o.sets,
    };
    const done: PlannedSession[] = extra ? [] : [{ ...$state.snapshot(planned), status: 'done' }];
    await store.saveHangSession(session, done);
    data.hangSessions = [...data.hangSessions, session];
    data.sessions = data.sessions.map((s) => done.find((d) => d.id === s.id) ?? s);
    go({ name: 'summary', id: session.id });
    void sync?.flush();
  }

  async function updateHangSession(s: HangSession) {
    if (!data || !store) return;
    // Update the screen first: the next quick tap builds on this change, not on the old record.
    data.hangSessions = data.hangSessions.map((x) => (x.id === s.id ? s : x));
    await store.saveHangSession(s);
  }

  function openNewEntry() {
    if (!data) return;
    const next = nextSession($state.snapshot(data.sessions));
    const now = new Date();
    now.setMinutes(0, 0, 0);
    go({ name: 'entry', entry: newEntry(next, now.toISOString(), crypto.randomUUID()), isNew: true });
  }

  function openEntry(id: string) {
    const e = data?.hangSessions.find((s) => s.id === id);
    if (e) go({ name: 'entry', entry: $state.snapshot(e), isNew: false });
  }

  async function saveEntry(entry: HangSession) {
    if (!data || !store) return;
    const previous = data.hangSessions.find((s) => s.id === entry.id);
    const planned = plannedChangesOnSave(entry, previous && $state.snapshot(previous), $state.snapshot(data.sessions), $state.snapshot(data.settings));
    await store.saveHangSession(entry, planned);
    data.hangSessions = previous ? data.hangSessions.map((s) => (s.id === entry.id ? entry : s)) : [...data.hangSessions, entry];
    data.sessions = data.sessions.map((s) => planned.find((p) => p.id === s.id) ?? s);
    back();
  }

  async function deleteEntry(entry: HangSession) {
    if (!data || !store) return;
    const planned = plannedChangesOnDelete(entry, $state.snapshot(data.sessions), $state.snapshot(data.settings));
    await store.deleteHangSession(entry.id, planned);
    data.hangSessions = data.hangSessions.filter((s) => s.id !== entry.id);
    data.sessions = data.sessions.map((s) => planned.find((p) => p.id === s.id) ?? s);
    back();
  }

  // ---- suggestions ----

  const suggestions = $derived(
    data ? findSuggestions(data.plan, data.sessions, data.hangSessions, data.settings, toIsoDate(new Date())) : [],
  );

  async function onSuggestion(s: Suggestion, action: SuggestionAction) {
    if (!data || !store) return;
    const before = $state.snapshot(data.sessions);
    const settings = $state.snapshot(data.settings);
    const newId = (type: string) => `${data!.plan.id}:x${crypto.randomUUID().slice(0, 6)}:${type}`;
    let after = before;
    if (action === 'accept' && s.kind === 'edge' && s.edgeMm) after = moveToEdge(before, settings, s.edgeMm);
    else if (action === 'accept' && s.kind === 'break') after = restartAfterBreak(before, settings, toIsoDate(new Date()), newId);
    else if (action === 'repeat') after = stepBack(before, settings, newId);
    else if (action === 'skip') after = skipNext(before);
    const changed = after.filter((x) => !before.includes(x));
    if (changed.length) await store.saveSessions(changed);
    data.sessions = after;
    const plan = { ...$state.snapshot(data.plan), handled: [...(data.plan.handled ?? []), s.key] };
    await store.savePlan(plan);
    data.plan = plan;
  }

  // ---- settings and data ----

  async function changeSettings(next: Settings) {
    if (!data || !store) return;
    await store.saveSettings(next);
    data.settings = next;
  }

  let scheduleOpen = $state(false);

  /** New weekly schedule: open sessions move to the new days, from today. */
  async function changeSchedule(days: ScheduleDay[]) {
    if (!data || !store) return;
    const next: Settings = { ...$state.snapshot(data.settings), schedule: { ...$state.snapshot(data.settings.schedule), days } };
    // Start tomorrow when a session was already logged today.
    const today = toIsoDate(new Date());
    const trainedToday = data.hangSessions.some((h) => toIsoDate(new Date(h.datetime)) === today);
    const before = $state.snapshot(data.sessions);
    const tag = `:s${crypto.randomUUID().slice(0, 4)}`;
    const result = applySchedule(before, next, $state.snapshot(data.plan), trainedToday ? addDays(today, 1) : today, tag);
    await store.saveSettings(next);
    await store.updateSessions(
      result.sessions.filter((x) => !before.includes(x)),
      result.removed,
    );
    data.settings = next;
    data.sessions = result.sessions;
    // The previewed session may have been rebuilt with a new id.
    if (view.name === 'preview' && !view.extra && !result.sessions.some((x) => x.id === (view as { id: string }).id)) back();
  }

  // Theme: "system" follows the phone; light and dark override it.
  $effect(() => {
    const theme = data?.settings.general.theme ?? 'system';
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  async function exportData() {
    if (!store) return;
    const doc = toDoc(await store.snapshot());
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `hangi-tracker-${toIsoDate(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Returns an error message for the user, or null on success. */
  async function importData(file: File): Promise<string | null> {
    if (!store) return 'Not ready.';
    try {
      const content = parseDoc(JSON.parse(await file.text()));
      await store.replaceAll(content, null);
      await reload();
      return null;
    } catch (e) {
      if (e instanceof DocError) return e.message;
      if (e instanceof SyntaxError) return 'The file is not valid JSON.';
      throw e;
    }
  }

  async function resetData() {
    if (!store) return;
    if (guest) await store.replaceAll(demoContent(toIsoDate(new Date())), { rev: 0 });
    else await store.clearAll();
    await reload();
  }

  const syncLine = $derived.by(() => {
    if (guest) return 'Guest mode: your data stays in this browser and is not saved on a server. Export it to keep a copy.';
    switch (syncStatus) {
      case 'offline':
        return 'Offline. Changes are kept on this device and sent when you are online.';
      case 'syncing':
        return 'Saving to the server…';
      case 'conflict':
        return 'The server has newer data from another device. See the message on Home.';
      case 'error':
        return 'Could not reach the server. It will try again after the next change.';
      default:
        return syncedAt ? `Saved on this device and on the server (${new Date(syncedAt).toLocaleString()}).` : 'Saved on this device.';
    }
  });

  // ---- routing ----

  // Sub-screens get one history entry, so the phone's back gesture leaves them.
  // The timer replaces the preview, and the summary replaces the timer.
  const SUB = new Set<View['name']>(['preview', 'timer', 'summary', 'entry']);
  const parentOf = (v: View): View => (v.name === 'entry' ? { name: 'log' } : { name: 'home' });

  function go(v: View) {
    if (SUB.has(v.name)) {
      if (SUB.has(view.name)) history.replaceState({ sub: true }, '');
      else history.pushState({ sub: true }, '');
    }
    view = v;
  }

  /** Leave a sub-screen, through history when it has an entry. */
  function back() {
    if (history.state?.sub) history.back();
    else view = parentOf(view);
  }

  function onPopState() {
    if (view.name === 'timer') {
      // Back during a session would lose it; Finish is the way out.
      history.pushState({ sub: true }, '');
      return;
    }
    if (SUB.has(view.name)) view = parentOf(view);
  }

  // Every screen change starts at the top.
  $effect(() => {
    void view;
    window.scrollTo(0, 0);
  });

  const current = $derived.by(() => {
    const v = view;
    if (!data || (v.name !== 'preview' && v.name !== 'timer')) return undefined;
    return v.extra ?? data.sessions.find((s) => s.id === v.id);
  });
  const isExtra = $derived((view.name === 'preview' || view.name === 'timer') && !!view.extra);
  const summarySession = $derived.by(() => {
    const v = view;
    return data && v.name === 'summary' ? data.hangSessions.find((s) => s.id === v.id) : undefined;
  });
  const tab = $derived(view.name === 'settings' ? 'settings' : view.name === 'log' ? 'log' : 'home');
</script>

<svelte:window onpopstate={onPopState} />

{#if !checked}
  <div class="center" aria-busy="true"></div>
{:else if offlineNoUser}
  <div class="center">
    <p>No connection. Log in once while online; after that the app also works offline.</p>
    <button class="btn btn-secondary" onclick={check}>Try again</button>
  </div>
{:else if !user || !data}
  <Login onLogin={(u) => enter(u, true)} onGuest={enterGuest} />
{:else if view.name === 'preview' && current}
  <main>
    <Preview
      session={current}
      settings={data.settings}
      onSave={saveSession}
      onReset={() => resetSession(current.id)}
      extra={isExtra}
      onMove={(date, shift) => moveDate(current.id, date, shift)}
      onSchedule={() => (scheduleOpen = true)}
      onSkip={async () => {
        await skip([current.id]);
        back();
      }}
      onBack={back}
      onStart={(s) => go({ name: 'timer', id: s.id, extra: isExtra ? s : undefined })}
    />
  </main>
{:else if view.name === 'timer' && current}
  <Timer session={current} settings={data.settings} onDone={(o) => timerDone(current, o, isExtra)} />
{:else if view.name === 'summary' && summarySession}
  <main>
    <Summary session={summarySession} lastBodyweight={lastBodyweight()} onChange={updateHangSession} onDone={back} />
  </main>
{:else if view.name === 'entry'}
  {@const v = view}
  <main>
    <EntryEditor
      entry={v.entry}
      isNew={v.isNew}
      planned={data.sessions}
      lastBodyweight={lastBodyweight()}
      onSave={saveEntry}
      onDelete={() => deleteEntry(v.entry)}
      onBack={back}
    />
  </main>
{:else}
  <main>
    {#if syncStatus === 'conflict'}
      <div class="notice notice-warning conflict" role="alert">
        <span><strong>Newer data on the server.</strong> Another device saved changes. Which copy do you want to keep?</span>
        <div class="conflict-actions">
          <button class="btn btn-secondary" onclick={() => sync?.useServer()}>Load server data</button>
          <button class="btn btn-secondary" onclick={() => sync?.useLocal()}>Keep this device</button>
        </div>
      </div>
    {/if}
    {#if view.name === 'settings'}
      <SettingsView
        {user}
        {guest}
        settings={data.settings}
        {syncLine}
        onChange={changeSettings}
        onSchedule={() => (scheduleOpen = true)}
        onLogout={doLogout}
        onExport={exportData}
        onImport={importData}
        onReset={resetData}
      />
    {:else if view.name === 'log'}
      <Progress plan={data.plan} planned={data.sessions} log={data.hangSessions} {suggestions} {onSuggestion} onOpen={openEntry} onAdd={openNewEntry} />
    {:else}
      <Home
        {user}
        {guest}
        onLeaveGuest={doLogout}
        plan={data.plan}
        sessions={data.sessions}
        hangSessions={data.hangSessions}
        settings={data.settings}
        suggestion={suggestions[0] ?? null}
        {onSuggestion}
        onOpen={(id) => go({ name: 'preview', id })}
        onExtra={openExtra}
        onSkip={skip}
        onSchedule={() => (scheduleOpen = true)}
      />
    {/if}
  </main>
  <nav aria-label="Main">
    <button class:active={tab === 'home'} aria-current={tab === 'home' ? 'page' : undefined} onclick={() => (view = { name: 'home' })}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>
      Home
    </button>
    <button class:active={tab === 'log'} aria-current={tab === 'log' ? 'page' : undefined} onclick={() => (view = { name: 'log' })}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20V11M10 20V5M16 20v-6M2 20h20"></path></svg>
      Progress
    </button>
    <button class:active={tab === 'settings'} aria-current={tab === 'settings' ? 'page' : undefined} onclick={() => (view = { name: 'settings' })}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"></path><circle cx="15" cy="6" r="2"></circle><circle cx="9" cy="12" r="2"></circle><circle cx="17" cy="18" r="2"></circle></svg>
      Settings
    </button>
  </nav>
{/if}

{#if undoSkip}
  <div class="toast" role="status">
    <span>{undoSkip.text}</span>
    <button onclick={undoLastSkip}>Undo</button>
  </div>
{/if}

{#if scheduleOpen && data}
  <ScheduleSheet days={data.settings.schedule.days} onSave={changeSchedule} onClose={() => (scheduleOpen = false)} />
{/if}

<style>
  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    padding: var(--sp-6);
    text-align: center;
  }
  main { flex: 1; display: flex; flex-direction: column; padding-top: env(safe-area-inset-top); }
  .conflict { flex-direction: column; margin: var(--sp-4) var(--sp-5) 0; }
  .conflict strong { font-weight: 600; }
  .conflict-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
  .conflict-actions .btn { height: 48px; font-size: 18px; color: var(--text); }
  nav {
    position: sticky;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid var(--divider);
    background: var(--bg);
    padding-bottom: env(safe-area-inset-bottom);
  }
  nav button {
    height: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: var(--fs-xs);
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(76px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(520px, calc(100% - 32px));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 10px 10px 16px;
    background: var(--text);
    color: var(--bg);
    box-shadow: var(--shadow-3);
    z-index: 15;
  }
  .toast button { min-height: 40px; padding: 0 12px; border: 0; background: transparent; color: var(--accent-tint); font-weight: 700; }
  nav button.active { color: var(--accent); font-weight: 600; box-shadow: inset 0 2px 0 var(--accent); }
</style>
