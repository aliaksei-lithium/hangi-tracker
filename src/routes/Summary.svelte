<script lang="ts">
  import { formatShortDate, toIsoDate } from '../lib/domain/dates';
  import { formatDuration } from '../lib/domain/plan';
  import type { HangSession } from '../lib/domain/types';
  import SafetyNotice from '../lib/ui/SafetyNotice.svelte';
  import SessionFields from '../lib/ui/SessionFields.svelte';

  // The session is already saved when this screen opens. Every change here is
  // saved at once, so all fields can be skipped and filled in later.
  let {
    session,
    lastBodyweight,
    onChange,
    onDone,
  }: {
    session: HangSession;
    lastBodyweight: number | null;
    onChange: (s: HangSession) => void;
    onDone: () => void;
  } = $props();

  const done = $derived(session.sets.filter((s) => s.completed).length);
  const underLoad = $derived(session.sets.reduce((sum, s) => sum + s.actualSec, 0));
  const edges = $derived([...new Set(session.sets.map((s) => s.edgeMm))].join('/'));
  const meta = $derived(
    [formatShortDate(toIsoDate(new Date(session.datetime))), edges && `${edges} mm`, session.week && `Week ${session.week}`].filter(Boolean).join(' · '),
  );
</script>

<div class="screen">
  <div class="content">
    <div class="head">
      <div class="meta">{meta}</div>
      <h1 class="display">Session done</h1>
    </div>

    <div class="stats">
      <div><span class="k">Sets</span><span class="v display">{done}/{session.plannedSets}</span></div>
      <div><span class="k">Under load</span><span class="v display">{formatDuration(underLoad)}</span></div>
      <div><span class="k">Total</span><span class="v display">{formatDuration(session.durationSec)}</span></div>
    </div>

    {#if session.sharpPain}<SafetyNotice />{/if}

    <SessionFields {session} {lastBodyweight} onChange={(p) => onChange({ ...$state.snapshot(session), ...p })} />
  </div>

  <div class="bottom">
    <button class="btn btn-primary done" onclick={onDone}>Done</button>
  </div>
</div>

<style>
  .screen { flex: 1; display: flex; flex-direction: column; }
  .content { flex: 1; padding: var(--sp-6) var(--sp-5) var(--sp-4); display: flex; flex-direction: column; gap: 22px; }
  .head { display: flex; flex-direction: column; gap: 2px; }
  .meta { font-size: var(--fs-sm); color: var(--muted); }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--divider); }
  .stats > div { padding: 12px; display: flex; flex-direction: column; }
  .stats > div + div { border-left: 1px solid var(--divider); }
  .k { font-size: 13px; color: var(--muted); }
  .v { font-size: 30px; font-variant-numeric: tabular-nums; }
  .bottom { position: sticky; bottom: 0; padding: 12px var(--sp-5) max(var(--sp-5), env(safe-area-inset-bottom)); background: var(--bg); }
  .done { width: 100%; height: 60px; font-size: 24px; }
</style>
