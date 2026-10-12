<script lang="ts">
  import { untrack } from 'svelte';
  import { formatShortDate } from '../lib/domain/dates';
  import { newEntry } from '../lib/domain/log';
  import { sortSessions } from '../lib/domain/plan';
  import { EDGES_MM, type HangSession, type PlannedSession } from '../lib/domain/types';
  import { typeLabel } from '../lib/format';
  import SafetyNotice from '../lib/ui/SafetyNotice.svelte';
  import SessionFields from '../lib/ui/SessionFields.svelte';

  // Add or edit a log entry. Changes are kept in a draft until Save.
  let {
    entry,
    isNew,
    planned,
    lastBodyweight,
    onSave,
    onDelete,
    onBack,
  }: {
    entry: HangSession;
    isNew: boolean;
    planned: PlannedSession[];
    lastBodyweight: number | null;
    onSave: (e: HangSession) => Promise<void>;
    onDelete: () => Promise<void>;
    onBack: () => void;
  } = $props();

  let draft = $state<HangSession>(untrack(() => structuredClone($state.snapshot(entry))));
  let confirmDelete = $state(false);
  let busy = $state(false);

  // Local date and time inputs, mapped to the ISO timestamp.
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = new Date(untrack(() => entry.datetime));
  let date = $state(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
  let time = $state(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  $effect(() => {
    const d = new Date(`${date}T${time || '00:00'}`);
    if (!Number.isNaN(d.getTime())) draft.datetime = d.toISOString();
  });

  // A planned session can be linked once: open ones, plus the one linked now.
  const choices = $derived(sortSessions(planned.filter((p) => p.status !== 'done' || p.id === entry.plannedId)));

  function link(id: string) {
    const p = planned.find((x) => x.id === id) ?? null;
    if (isNew) {
      // A new entry takes the sets of the chosen session.
      const fresh = newEntry(p, draft.datetime, draft.id);
      draft.sets = fresh.sets;
      draft.plannedSets = fresh.plannedSets;
    }
    draft.plannedId = p?.id ?? null;
    draft.type = p?.type ?? null;
    draft.week = p?.week ?? null;
  }

  function addSet() {
    const last = draft.sets[draft.sets.length - 1] ?? { edgeMm: 25, targetSec: 5, actualSec: 5, completed: true };
    draft.sets.push({ ...last });
    if (isNew) draft.plannedSets = draft.sets.length;
  }

  function removeSet(i: number) {
    draft.sets.splice(i, 1);
    if (isNew) draft.plannedSets = draft.sets.length;
  }

  const int = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

  async function save() {
    busy = true;
    try {
      await onSave($state.snapshot(draft));
    } finally {
      busy = false;
    }
  }

  async function doDelete() {
    busy = true;
    try {
      await onDelete();
    } finally {
      busy = false;
    }
  }
</script>

<div class="screen">
  <div class="topbar">
    <button class="icon" aria-label="Back" onclick={onBack}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M15 5l-7 7 7 7"></path></svg>
    </button>
  </div>

  <div class="content">
    <h1 class="display">{isNew ? 'Add past session' : 'Edit session'}</h1>

    <div class="two">
      <label class="field"><span class="label">Date</span><input type="date" bind:value={date} required /></label>
      <label class="field"><span class="label">Time</span><input type="time" bind:value={time} /></label>
    </div>

    <label class="field">
      <span class="label">Plan session</span>
      <select value={draft.plannedId ?? ''} onchange={(e) => link(e.currentTarget.value)}>
        <option value="">Not in the plan</option>
        {#each choices as p (p.id)}
          <option value={p.id}>{formatShortDate(p.date)} · Week {p.week} · {typeLabel(p.type)}</option>
        {/each}
      </select>
    </label>

    <section>
      <div class="sets-head label"><span>Set</span><span>Edge</span><span>Target</span><span>Held</span><span>Done</span><span></span></div>
      {#each draft.sets as s, i (i)}
        <div class="set">
          <span class="n display">{i + 1}</span>
          <select aria-label="Edge, set {i + 1}" bind:value={s.edgeMm}>
            {#each EDGES_MM as e (e)}<option value={e}>{e}</option>{/each}
          </select>
          <input aria-label="Target seconds, set {i + 1}" type="number" inputmode="numeric" min="1" max="60" value={s.targetSec} onchange={(e) => (s.targetSec = int(e.currentTarget.value, 1, 60))} />
          <input aria-label="Held seconds, set {i + 1}" type="number" inputmode="numeric" min="0" max="120" value={s.actualSec} onchange={(e) => (s.actualSec = int(e.currentTarget.value, 0, 120))} />
          <input aria-label="Completed, set {i + 1}" type="checkbox" bind:checked={s.completed} />
          <button class="x" aria-label="Remove set {i + 1}" disabled={draft.sets.length <= 1} onclick={() => removeSet(i)}>×</button>
        </div>
      {/each}
      <button class="link" onclick={addSet}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
        Add set
      </button>
    </section>

    {#if draft.sharpPain}<SafetyNotice />{/if}

    <SessionFields session={draft} {lastBodyweight} onChange={(p) => Object.assign(draft, p)} />

    {#if !isNew}
      <button class="link danger" onclick={() => (confirmDelete = true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
        Delete session
      </button>
    {/if}
  </div>

  <div class="bottom">
    <button class="btn btn-primary save" disabled={busy} onclick={save}>Save</button>
  </div>

  {#if confirmDelete}
    <div class="scrim" role="presentation">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="del-title">
        <h2 id="del-title" class="display">Delete this session?</h2>
        <p class="muted">It is removed from the log and the progress views. This cannot be undone.</p>
        <div class="actions">
          <button class="btn btn-secondary" onclick={() => (confirmDelete = false)}>Cancel</button>
          <button class="btn btn-danger" disabled={busy} onclick={doDelete}>Delete</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .screen { flex: 1; display: flex; flex-direction: column; }
  .topbar { display: flex; padding: 0 4px; }
  .icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; }
  .content { flex: 1; padding: 0 var(--sp-5) var(--sp-6); display: flex; flex-direction: column; gap: 20px; }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .label { font-size: 13px; color: var(--muted); }
  input, select { height: 48px; padding: 0 10px; background: var(--surface); border: 1px solid var(--divider); border-radius: var(--r-1); font: inherit; font-size: 15px; color: var(--text); min-width: 0; }
  section { display: flex; flex-direction: column; gap: 6px; }
  .sets-head, .set { display: grid; grid-template-columns: 28px 1fr 1fr 1fr 40px 36px; gap: 6px; align-items: center; }
  .n { font-size: 20px; }
  .set input[type='checkbox'] { width: 24px; height: 24px; justify-self: center; accent-color: var(--accent); }
  .x { height: 44px; border: 0; background: transparent; font-size: 22px; color: var(--muted); }
  .x:disabled { opacity: 0.3; }
  .link { min-height: 48px; display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; color: var(--accent); font-weight: 600; font-size: 15px; padding: 0; align-self: flex-start; }
  .danger { color: var(--danger); }
  .muted { color: var(--muted); margin: 0; }
  .bottom { position: sticky; bottom: 0; padding: 12px var(--sp-5) max(var(--sp-5), env(safe-area-inset-bottom)); background: var(--bg); box-shadow: var(--shadow-2); }
  .save { width: 100%; height: 60px; font-size: 24px; }
  .scrim { position: fixed; inset: 0; background: rgba(14, 15, 16, 0.55); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
  .sheet { width: 100%; max-width: 560px; background: var(--surface); box-shadow: var(--shadow-3); padding: 24px 20px max(34px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16px; }
  h2 { margin: 0; font-size: 28px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
