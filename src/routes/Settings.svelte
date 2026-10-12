<script lang="ts">
  import { untrack } from 'svelte';
  import { player } from '../lib/audio/player';
  import type { User } from '../lib/api';
  import { formatDuration } from '../lib/domain/plan';
  import type { EditScope, Settings } from '../lib/domain/types';
  import Stepper from '../lib/ui/Stepper.svelte';
  import Switch from '../lib/ui/Switch.svelte';

  let {
    user,
    settings,
    onChange,
    onLogout,
  }: {
    user: User;
    settings: Settings;
    onChange: (settings: Settings) => void;
    onLogout: () => void;
  } = $props();

  // Edit a copy, save on every change.
  let draft = $state<Settings>(untrack(() => structuredClone($state.snapshot(settings))));
  $effect(() => {
    const next = $state.snapshot(draft);
    if (JSON.stringify(next) !== JSON.stringify($state.snapshot(settings))) onChange(next);
  });

  const SCOPES: { value: EditScope | null; label: string }[] = [
    { value: null, label: 'Ask every time' },
    { value: 'this', label: 'Only this session' },
    { value: 'all', label: 'This and all next sessions' },
  ];

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
      <div class="row">
        <span class="text"><span>Warm-up rest</span><span class="sub">Between warm-up hangs</span></span>
        <div class="step"><Stepper label="Warm-up rest" bind:value={draft.protocol.warmup.restSec} step={15} min={15} max={300} format={formatDuration} /></div>
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
    <h2 class="eyebrow">Signed in as</h2>
    <div>{user.displayName}</div>
    <button class="btn btn-secondary" onclick={onLogout}>Log out</button>
  </section>
</div>

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
  .options { display: flex; flex-direction: column; border: 1px solid var(--divider); }
  .option { min-height: 52px; display: flex; align-items: center; gap: 14px; padding: 8px 14px; cursor: pointer; }
  .option + .option { border-top: 1px solid var(--divider); }
  .option input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); }
</style>
