<script lang="ts">
  import { untrack } from 'svelte';
  import { player } from '../lib/audio/player';
  import type { User } from '../lib/api';
  import { formatDuration } from '../lib/domain/plan';
  import { WEEKDAY_NAMES } from '../lib/domain/dates';
  import { EDGES_MM, type EditScope, type Settings } from '../lib/domain/types';
  import Stepper from '../lib/ui/Stepper.svelte';
  import Switch from '../lib/ui/Switch.svelte';

  let {
    user,
    settings,
    syncLine,
    onChange,
    onLogout,
    onExport,
    onImport,
    onReset,
  }: {
    user: User;
    settings: Settings;
    syncLine: string;
    onChange: (settings: Settings) => void;
    onLogout: () => void;
    onExport: () => void;
    onImport: (file: File) => Promise<string | null>;
    onReset: () => Promise<void>;
  } = $props();

  let importError = $state<string | null>(null);
  let pendingImport = $state<File | null>(null);
  let confirmReset = $state(false);
  let fileInput: HTMLInputElement;

  async function runImport() {
    if (!pendingImport) return;
    importError = await onImport(pendingImport);
    pendingImport = null;
  }

  // Edit a copy, save on every change.
  let draft = $state<Settings>(untrack(() => structuredClone($state.snapshot(settings))));
  $effect(() => {
    // Tracks only the draft: save when the user changed something.
    const next = $state.snapshot(draft);
    if (JSON.stringify(next) !== untrack(() => JSON.stringify($state.snapshot(settings)))) onChange(next);
  });
  $effect(() => {
    // Tracks only the prop: take new settings from outside (import, reset, sync).
    const outside = $state.snapshot(settings);
    if (untrack(() => JSON.stringify($state.snapshot(draft))) !== JSON.stringify(outside)) draft = structuredClone(outside);
  });

  const SCOPES: { value: EditScope | null; label: string }[] = [
    { value: null, label: 'Ask every time' },
    { value: 'this', label: 'Only this session' },
    { value: 'all', label: 'This and all next sessions' },
  ];

  // Monday first, like the calendar.
  const DAYS = [1, 2, 3, 4, 5, 6, 0];
  const THEMES = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ] as const;

  const TOGGLES = [
    { key: 'beeps', label: 'Beeps', sub: '3-2-1 before each hang, start and end of hang' },
    { key: 'voice', label: 'Voice prompts', sub: '“Get ready”, “Hang”, “Rest”, “Next set”' },
    { key: 'wakeLock', label: 'Keep screen on', sub: 'While the timer runs' },
  ] as const;
</script>

<!-- Phase 7 adds the remaining groups (protocol, schedule, units, theme, language, data). -->
<div class="content">
  <h1 class="display">Settings</h1>

  <section>
    <h2 class="eyebrow">Timer</h2>
    <div class="rows">
      <div class="row">
        <span class="text"><span>Start countdown</span><span class="sub">Before the first hang</span></span>
        <div class="step"><Stepper label="Start countdown" bind:value={draft.timer.countdownSec} min={0} max={30} format={(v) => `${v} s`} /></div>
      </div>
      <div class="row">
        <span class="text"><span>Get ready</span><span class="sub">Before each set, taken from the rest</span></span>
        <div class="step"><Stepper label="Get ready" bind:value={draft.timer.prepareSec} min={0} max={15} format={(v) => `${v} s`} /></div>
      </div>
    </div>
    <div class="rows">
      {#each TOGGLES as t (t.key)}
        <div class="row">
          <span class="text"><span>{t.label}</span><span class="sub">{t.sub}</span></span>
          <Switch bind:checked={draft.timer[t.key]} label={t.label} />
        </div>
      {/each}
      <div class="row">
        <span class="text"><span>Warm-up by default</span><span class="sub">New sessions start with warm-up</span></span>
        <Switch bind:checked={draft.protocol.warmupOn} label="Warm-up by default" />
      </div>
    </div>
    <button class="btn btn-secondary test" onclick={() => player.test()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16 9a4 4 0 0 1 0 6"></path></svg>
      Play test signals
    </button>
  </section>

  <section>
    <h2 class="eyebrow">Warm-up</h2>
    <div class="rows">
      <div class="row">
        <span class="text"><span>Edge</span></span>
        <select class="select" aria-label="Warm-up edge" bind:value={draft.protocol.warmup.edgeMm}>
          {#each EDGES_MM as e (e)}<option value={e}>{e} mm</option>{/each}
        </select>
      </div>
      <div class="row">
        <span class="text"><span>Hang</span></span>
        <div class="step"><Stepper label="Warm-up hang" bind:value={draft.protocol.warmup.hangSec} min={3} max={30} format={(v) => `${v} s`} /></div>
      </div>
      <div class="row">
        <span class="text"><span>Sets</span></span>
        <div class="step"><Stepper label="Warm-up sets" bind:value={draft.protocol.warmup.sets} min={1} max={6} /></div>
      </div>
      <div class="row">
        <span class="text"><span>Rest</span><span class="sub">Between warm-up hangs</span></span>
        <div class="step"><Stepper label="Warm-up rest" bind:value={draft.protocol.warmup.restSec} step={15} min={15} max={300} format={formatDuration} /></div>
      </div>
    </div>
  </section>

  <section>
    <h2 class="eyebrow">Schedule</h2>
    <div class="rows">
      <div class="row">
        <span class="text"><span>Full session</span></span>
        <select class="select" aria-label="Full session day" bind:value={draft.schedule.fullDay}>
          {#each DAYS as d (d)}<option value={d} disabled={d === draft.schedule.lightDay}>{WEEKDAY_NAMES[d]}</option>{/each}
        </select>
      </div>
      <div class="row">
        <span class="text"><span>Light session</span></span>
        <select class="select" aria-label="Light session day" bind:value={draft.schedule.lightDay}>
          {#each DAYS as d (d)}<option value={d} disabled={d === draft.schedule.fullDay}>{WEEKDAY_NAMES[d]}</option>{/each}
        </select>
      </div>
      <div class="row">
        <span class="text"><span>Minimum gap</span><span class="sub">A warning, not a block</span></span>
        <div class="step"><Stepper label="Minimum gap" bind:value={draft.schedule.minGapHours} step={12} min={24} max={96} format={(v) => `${v} h`} /></div>
      </div>
    </div>
    <p class="muted small">Changing the days moves the open sessions to the new days, from today.</p>
  </section>

  <section>
    <h2 class="eyebrow">Progression rules</h2>
    <div class="rows">
      <div class="row">
        <span class="text"><span>Suggestions</span><span class="sub">Smaller edge, step back, back after a break</span></span>
        <Switch bind:checked={draft.rules.suggestions} label="Suggestions" />
      </div>
      <div class="row">
        <span class="text"><span>Pain threshold</span><span class="sub">Pain above this suggests a step back</span></span>
        <div class="step"><Stepper label="Pain threshold" bind:value={draft.rules.painThreshold} min={0} max={9} format={(v) => `${v} / 10`} /></div>
      </div>
      <div class="row">
        <span class="text"><span>Break</span><span class="sub">After this many days, go back one week (0 = off)</span></span>
        <div class="step"><Stepper label="Break days" bind:value={draft.rules.breakDays} min={0} max={60} format={(v) => (v ? `${v} days` : 'Off')} /></div>
      </div>
    </div>
  </section>

  <section>
    <h2 class="eyebrow">Saving edits on the preview</h2>
    <div class="options" role="radiogroup" aria-label="Saving edits on the preview">
      {#each SCOPES as s (s.label)}
        <label class="option">
          <input type="radio" name="scope" checked={draft.rules.editScope === s.value} onchange={() => (draft.rules.editScope = s.value)} />
          <span>{s.label}</span>
        </label>
      {/each}
    </div>
  </section>

  <section>
    <h2 class="eyebrow">Theme</h2>
    <div class="segmented" role="radiogroup" aria-label="Theme">
      {#each THEMES as t (t.value)}
        <button role="radio" aria-checked={draft.general.theme === t.value} class:sel={draft.general.theme === t.value} onclick={() => (draft.general.theme = t.value)}>{t.label}</button>
      {/each}
    </div>
  </section>

  <section>
    <h2 class="eyebrow">Data</h2>
    <p class="muted small">{syncLine}</p>
    <div class="data-actions">
      <button class="btn btn-secondary" onclick={onExport}>Export JSON</button>
      <button class="btn btn-secondary" onclick={() => fileInput.click()}>Import JSON</button>
    </div>
    <input
      bind:this={fileInput}
      class="hidden"
      type="file"
      accept="application/json,.json"
      onchange={(e) => {
        pendingImport = e.currentTarget.files?.[0] ?? null;
        importError = null;
        e.currentTarget.value = '';
      }}
    />
    {#if importError}<div class="notice notice-danger" role="alert"><span>{importError}</span></div>{/if}
    <button class="link danger" onclick={() => (confirmReset = true)}>Reset all data</button>
  </section>

  <section>
    <h2 class="eyebrow">Signed in as</h2>
    <div>{user.displayName}</div>
    <button class="btn btn-secondary" onclick={onLogout}>Log out</button>
  </section>
</div>

{#if pendingImport}
  <div class="scrim" role="presentation">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="imp-title">
      <h2 id="imp-title" class="display">Replace all data?</h2>
      <p class="muted">The file {pendingImport.name} replaces the plan, the log and the settings on this device and on the server.</p>
      <div class="actions">
        <button class="btn btn-secondary" onclick={() => (pendingImport = null)}>Cancel</button>
        <button class="btn btn-primary" onclick={runImport}>Replace</button>
      </div>
    </div>
  </div>
{/if}

{#if confirmReset}
  <div class="scrim" role="presentation">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <h2 id="reset-title" class="display">Reset all data?</h2>
      <p class="muted">The log, the plan and the settings are deleted here and on the server. A new 8-week plan starts. Export first if you want a copy.</p>
      <div class="actions">
        <button class="btn btn-secondary" onclick={() => (confirmReset = false)}>Cancel</button>
        <button
          class="btn btn-danger"
          onclick={async () => {
            await onReset();
            confirmReset = false;
          }}>Reset</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .content { padding: var(--sp-6) var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-6); }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  section { display: flex; flex-direction: column; gap: var(--sp-3); }
  h2 { margin: 0; }
  .rows { display: flex; flex-direction: column; border-top: 1px solid var(--divider); }
  .row { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--divider); padding: 6px 0; }
  .text { display: flex; flex-direction: column; }
  .sub { font-size: 13px; color: var(--muted); }
  .step { width: 156px; flex: none; }
  /* The row text already names the stepper. */
  .step :global(.label) { display: none; }
  .test { height: 52px; font-size: 20px; }
  .select { height: 48px; min-width: 140px; padding: 0 10px; background: var(--surface); border: 1px solid var(--divider); border-radius: var(--r-1); font: inherit; font-size: 15px; color: var(--text); }
  .segmented { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--divider); }
  .segmented button { height: 48px; border: 0; background: transparent; font-size: 15px; }
  .segmented button + button { border-left: 1px solid var(--divider); }
  .segmented .sel { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .options { display: flex; flex-direction: column; border: 1px solid var(--divider); }
  .option { min-height: 52px; display: flex; align-items: center; gap: 14px; padding: 8px 14px; cursor: pointer; }
  .option + .option { border-top: 1px solid var(--divider); }
  .option input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); }
  .muted { color: var(--muted); margin: 0; }
  .small { font-size: var(--fs-sm); }
  .data-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .data-actions .btn { font-size: 20px; height: 52px; }
  .hidden { display: none; }
  .link { min-height: 48px; border: 0; background: transparent; font-weight: 600; font-size: 15px; padding: 0; align-self: flex-start; }
  .danger { color: var(--danger); }
  .scrim { position: fixed; inset: 0; background: rgba(14, 15, 16, 0.55); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
  .sheet { width: 100%; max-width: 560px; background: var(--surface); box-shadow: var(--shadow-3); padding: 24px 20px max(34px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16px; }
  .sheet h2 { font-size: 28px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
