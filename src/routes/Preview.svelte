<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { player } from '../lib/audio/player';
  import { daysBetween, formatShortDate, toIsoDate } from '../lib/domain/dates';
  import { formatDuration, sessionDurationSec } from '../lib/domain/plan';
  import { EDGES_MM, type EditScope, type PlannedSession, type Settings } from '../lib/domain/types';
  import { GRIPS, gripLabel, kg, typeLabel } from '../lib/format';
  import Stepper from '../lib/ui/Stepper.svelte';
  import Switch from '../lib/ui/Switch.svelte';

  let {
    session,
    settings,
    onSave,
    onReset,
    onBack,
    onStart,
    onMove,
    extra = false,
  }: {
    session: PlannedSession;
    settings: Settings;
    onSave: (draft: PlannedSession, scope: EditScope, remember: boolean) => Promise<void>;
    onReset: () => Promise<void>;
    onBack: () => void;
    /** Gets the session as edited; for a planned session it equals the saved one. */
    onStart: (session: PlannedSession) => void;
    onMove: (date: string, shiftNext: boolean) => Promise<void>;
    /** A one-off session outside the plan: edits are not saved, there is no date to change. */
    extra?: boolean;
  } = $props();

  // Change date sheet.
  let dateSheet = $state(false);
  let newDate = $state('');
  let shiftNext = $state(true);
  const shiftDays = $derived(newDate ? daysBetween(session.date, newDate) : 0);

  function openDateSheet() {
    newDate = toIsoDate(new Date());
    shiftNext = true;
    dateSheet = true;
  }

  async function moveDate() {
    if (!newDate) return;
    // Keep unsaved set edits across the move.
    const edits = $state.snapshot(draft);
    saving = true;
    try {
      await onMove(newDate, shiftNext);
      await tick();
      draft = { ...copy(), warmup: edits.warmup, sets: edits.sets };
      dateSheet = false;
    } finally {
      saving = false;
    }
  }

  const start = () => onStart($state.snapshot(draft));


  // The draft is a deep copy; the saved session only changes on Save.
  const copy = () => structuredClone($state.snapshot(session));
  let draft = $state<PlannedSession>(untrack(copy));
  let open = $state<number | null>(null);
  let dialog = $state<null | 'start' | 'back'>(null);
  let scope = $state<EditScope>('this');
  let remember = $state(false);
  let saving = $state(false);

  $effect(() => {
    // A new session from outside (after save or reset) replaces the draft.
    draft = copy();
  });

  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(session));
  const total = $derived(formatDuration(sessionDurationSec(draft, settings)));
  const w = $derived(settings.protocol.warmup);
  // Most common edge; a set on another edge is highlighted.
  const mainEdge = $derived.by(() => {
    const count = new Map<number, number>();
    for (const s of draft.sets) count.set(s.edgeMm, (count.get(s.edgeMm) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  });

  function applyToAll(i: number) {
    const src = draft.sets[i];
    draft.sets = draft.sets.map((s) => ({ ...s, edgeMm: src.edgeMm, hangSec: src.hangSec, restSec: src.restSec, grip: src.grip, addedKg: src.addedKg }));
  }

  function removeSet(i: number) {
    draft.sets.splice(i, 1);
    open = null;
  }

  function addSet() {
    const last = draft.sets[draft.sets.length - 1];
    draft.sets.push({ ...last });
    open = draft.sets.length - 1;
  }

  function leave(action: 'start' | 'back') {
    // Audio may only be unlocked inside the tap itself.
    if (action === 'start') player.unlock();
    if (extra || !dirty) return action === 'start' ? start() : onBack();
    const remembered = settings.rules.editScope;
    if (remembered) return save(action, remembered, false);
    scope = 'this';
    remember = false;
    dialog = action;
  }

  async function save(action: 'start' | 'back', s: EditScope, rememberChoice: boolean) {
    if (action === 'start') player.unlock();
    saving = true;
    try {
      await onSave($state.snapshot(draft), s, rememberChoice);
      dialog = null;
      if (action === 'start') start();
      else onBack();
    } finally {
      saving = false;
    }
  }

  function discard() {
    dialog = null;
    onBack();
  }
</script>

<div class="screen">
  <div class="topbar">
    <button class="icon" aria-label="Back" onclick={() => leave('back')}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M15 5l-7 7 7 7"></path></svg>
    </button>
    {#if !extra}<button class="link" onclick={onReset}>Reset to plan</button>{/if}
  </div>

  <div class="content">
    <div class="head">
      {#if extra}
        <div class="meta">Today · {typeLabel(draft.type)} · outside the plan</div>
      {:else}
        <div class="meta">
          {formatShortDate(draft.date)} · Week {draft.week} · {typeLabel(draft.type)}
          <button class="inline-link" onclick={openDateSheet}>Change date</button>
        </div>
      {/if}
      <div class="titlebar">
        <h1 class="display">Session preview</h1>
        <span class="display total" aria-label="Total time {total}">{total}</span>
      </div>
    </div>

    <div class="warmup">
      <div class="col">
        <span class="strong">Warm-up</span>
        <span class="muted small">{w.sets} × {w.hangSec} s · {w.edgeMm} mm · rest {formatDuration(w.restSec)}</span>
      </div>
      <Switch bind:checked={draft.warmup} label="Warm-up" />
    </div>

    <div class="sets">
      {#each draft.sets as set, i (i)}
        <div class="set">
          <button class="row" aria-expanded={open === i} aria-label="Set {i + 1}: {set.edgeMm} mm, {set.hangSec} s" onclick={() => (open = open === i ? null : i)}>
            <span class="display n">Set {i + 1}</span>
            <span class="vals">
              <span class:em={set.edgeMm !== mainEdge}>{set.edgeMm} mm</span>
              <span>{set.hangSec} s</span>
              {#if i < draft.sets.length - 1}<span>rest {formatDuration(set.restSec)}</span>{/if}
              <span class="muted">{gripLabel(set.grip)} · {kg(set.addedKg)}</span>
            </span>
            <svg class="chev" class:up={open === i} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 9l6 6 6-6"></path></svg>
          </button>

          {#if open === i}
            <div class="editor">
              <div class="field">
                <span class="label">Edge</span>
                <div class="segmented" role="radiogroup" aria-label="Edge for set {i + 1}">
                  {#each EDGES_MM as e (e)}
                    <button role="radio" aria-checked={set.edgeMm === e} class:sel={set.edgeMm === e} onclick={() => (set.edgeMm = e)}>
                      {e}{set.edgeMm === e ? ' mm' : ''}
                    </button>
                  {/each}
                </div>
              </div>
              <div class="grid">
                <Stepper label="Hang" bind:value={set.hangSec} min={1} max={60} format={(v) => `${v} s`} />
                <Stepper label="Rest after" bind:value={set.restSec} step={15} min={0} max={600} format={formatDuration} />
                <Stepper label="Added weight" bind:value={set.addedKg} step={1} min={-50} max={50} format={kg} />
                <div class="field">
                  <label class="label" for="grip-{i}">Grip</label>
                  <select id="grip-{i}" bind:value={set.grip}>
                    {#each GRIPS as g (g.value)}<option value={g.value}>{g.label}</option>{/each}
                  </select>
                </div>
              </div>
              <div class="editor-actions">
                {#if draft.sets.length > 1}
                  <button class="link" onclick={() => applyToAll(i)}>Use for all sets</button>
                  <button class="link danger" onclick={() => removeSet(i)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
                    Remove set
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
      {#if draft.sets.length < 12}
        <button class="add link" onclick={addSet}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 5v14M5 12h14"></path></svg>
          Add set
        </button>
      {/if}
    </div>
  </div>

  <div class="startbar">
    <button class="btn btn-primary start" onclick={() => leave('start')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"></path></svg>
      Start · {total}
    </button>
  </div>

  {#if dialog}
    <div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (dialog = null)}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="scope-title">
        <h2 id="scope-title" class="display">Save changes for</h2>
        <div class="options" role="radiogroup">
          <label class="option">
            <input type="radio" name="scope" value="this" bind:group={scope} />
            <span>Only this session</span>
          </label>
          <label class="option">
            <input type="radio" name="scope" value="all" bind:group={scope} />
            <span>This and all next {draft.type} sessions</span>
          </label>
        </div>
        {#if scope === 'all'}
          <p class="muted small hint">Changes to a single set stay in this session. Hang time and sets change by the same amount in later weeks.</p>
        {/if}
        <label class="remember"><input type="checkbox" bind:checked={remember} /> Remember my choice</label>
        <div class="sheet-actions">
          {#if dialog === 'back'}
            <button class="btn btn-secondary" onclick={discard}>Discard</button>
          {:else}
            <button class="btn btn-secondary" onclick={() => (dialog = null)}>Cancel</button>
          {/if}
          <button class="btn btn-primary" disabled={saving} onclick={() => save(dialog!, scope, remember)}>Save</button>
        </div>
      </div>
    </div>
  {/if}
</div>

{#if dateSheet}
  <div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (dateSheet = false)}>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="date-title">
      <h2 id="date-title" class="display">Change date</h2>
      <p class="muted small">Planned for {formatShortDate(session.date)}.</p>
      <label class="date-field">
        <span class="muted small">New date</span>
        <input type="date" bind:value={newDate} />
      </label>
      {#if shiftDays !== 0}
        <label class="remember">
          <input type="checkbox" bind:checked={shiftNext} />
          Also move the next sessions {Math.abs(shiftDays)} day{Math.abs(shiftDays) === 1 ? '' : 's'} {shiftDays < 0 ? 'earlier' : 'later'}
        </label>
      {/if}
      <div class="sheet-actions">
        <button class="btn btn-secondary" onclick={() => (dateSheet = false)}>Cancel</button>
        <button class="btn btn-primary" disabled={saving || !newDate || shiftDays === 0} onclick={moveDate}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .screen { flex: 1; display: flex; flex-direction: column; position: relative; }
  .topbar { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 4px; }
  .icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; }
  .link { min-height: 48px; display: inline-flex; align-items: center; gap: 8px; padding: 0 12px; border: 0; background: transparent; color: var(--accent); font-weight: 600; font-size: 15px; }
  .danger { color: var(--danger); }
  .content { flex: 1; padding: 0 var(--sp-5) var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-4); }
  .head { display: flex; flex-direction: column; gap: 2px; }
  .meta { font-size: var(--fs-sm); color: var(--muted); display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .inline-link { border: 0; background: transparent; padding: 0; min-height: 32px; color: var(--accent); font-weight: 600; font-size: var(--fs-sm); }
  .sheet p { margin: 0; }
  .date-field { display: flex; flex-direction: column; gap: 6px; }
  .date-field input { height: 48px; padding: 0 10px; background: var(--bg); border: 1px solid var(--divider); border-radius: var(--r-1); font: inherit; color: var(--text); }
  .titlebar { display: flex; align-items: baseline; justify-content: space-between; }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  .total { font-size: var(--fs-xl); font-variant-numeric: tabular-nums; }
  .warmup { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--divider); }
  .col { display: flex; flex-direction: column; }
  .strong { font-weight: 600; }
  .muted { color: var(--muted); }
  .small { font-size: var(--fs-sm); }
  .sets { display: flex; flex-direction: column; }
  .set { border-bottom: 1px solid var(--divider); }
  .row { width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; border: 0; background: transparent; text-align: left; padding: 0; }
  .n { font-size: 20px; width: 46px; flex: none; }
  .vals { flex: 1; display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 15px; font-variant-numeric: tabular-nums; }
  .em { font-weight: 600; color: var(--accent); }
  .chev { color: var(--muted); flex: none; transition: transform 0.15s; }
  .chev.up { transform: rotate(180deg); }
  .editor { display: flex; flex-direction: column; gap: 14px; padding: 4px 0 16px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .label { font-size: 13px; color: var(--muted); }
  .segmented { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--divider); }
  .segmented button { height: 48px; border: 0; background: transparent; font-size: 15px; }
  .segmented button + button { border-left: 1px solid var(--divider); }
  .segmented .sel { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  select { height: 48px; padding: 0 12px; border: 1px solid var(--divider); border-radius: var(--r-1); background: var(--bg); font: inherit; font-size: 15px; color: var(--text); }
  .editor-actions { display: flex; justify-content: space-between; margin: 0 -12px; }
  .add { height: 56px; padding: 0; }
  .startbar { position: sticky; bottom: 0; padding: 12px var(--sp-5) max(var(--sp-5), env(safe-area-inset-bottom)); background: var(--bg); box-shadow: var(--shadow-2); }
  .start { width: 100%; height: 60px; font-size: 24px; }
  .scrim { position: fixed; inset: 0; background: rgba(14, 15, 16, 0.55); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
  .sheet { width: 100%; max-width: 560px; background: var(--surface); box-shadow: var(--shadow-3); padding: 24px 20px max(34px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16px; }
  h2 { margin: 0; font-size: 28px; }
  .options { display: flex; flex-direction: column; border: 1px solid var(--divider); }
  .option { min-height: 60px; display: flex; align-items: center; gap: 14px; padding: 10px 14px; cursor: pointer; }
  .option + .option { border-top: 1px solid var(--divider); }
  .option input, .remember input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); flex: none; }
  .option:has(input:checked) span { font-weight: 600; }
  .hint { margin: -6px 0 0; }
  .remember { min-height: 48px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
  .sheet-actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; }
</style>
