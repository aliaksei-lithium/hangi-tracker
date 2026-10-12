<script lang="ts">
  import { formatShortDate, toIsoDate } from '../lib/domain/dates';
  import { sortLog } from '../lib/domain/log';
  import type { HangSession } from '../lib/domain/types';
  import { typeLabel } from '../lib/format';

  let { log, onOpen, onAdd }: { log: HangSession[]; onOpen: (id: string) => void; onAdd: () => void } = $props();

  const rows = $derived(sortLog(log));

  function detail(s: HangSession): string {
    const done = s.sets.filter((x) => x.completed).length;
    const edges = [...new Set(s.sets.map((x) => x.edgeMm))].join('/');
    return [`${done}/${s.plannedSets} sets`, edges && `${edges} mm`, s.rpe && `RPE ${s.rpe}`, s.painLevel !== null && `pain ${s.painLevel}`]
      .filter(Boolean)
      .join(' · ');
  }
</script>

<div class="content">
  <div class="titlebar">
    <h2 class="display">Log</h2>
    <button class="link" onclick={onAdd}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
      Add past session
    </button>
  </div>

  {#if rows.length === 0}
    <p class="muted">No sessions yet. Finished sessions appear here on their own.</p>
  {:else}
    <div class="list">
      {#each rows as s (s.id)}
        <button class="item" onclick={() => onOpen(s.id)}>
          <span class="main">
            <strong>{formatShortDate(toIsoDate(new Date(s.datetime)))}</strong>{s.type ? ` · ${typeLabel(s.type)}` : ''}{s.week ? ` · Week ${s.week}` : ''}
          </span>
          <span class="muted small">{detail(s)}</span>
          {#if s.sharpPain}<span class="flag">Sharp pain reported</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .content { display: flex; flex-direction: column; gap: var(--sp-4); }
  .titlebar { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: var(--fs-xl); }
  .link { min-height: 48px; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--accent); font-weight: 600; font-size: 15px; padding: 0; }
  .list { display: flex; flex-direction: column; border-top: 1px solid var(--divider); }
  .item { min-height: 64px; display: flex; flex-direction: column; justify-content: center; gap: 2px; border: 0; border-bottom: 1px solid var(--divider); background: transparent; text-align: left; padding: 8px 0; }
  .main strong { font-weight: 600; }
  .muted { color: var(--muted); margin: 0; }
  .small { font-size: var(--fs-sm); }
  .flag { font-size: var(--fs-xs); font-weight: 600; color: var(--danger); }
</style>
