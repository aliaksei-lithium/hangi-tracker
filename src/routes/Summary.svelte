<script lang="ts">
  import { formatShortDate, toIsoDate } from '../lib/domain/dates';
  import { formatDuration } from '../lib/domain/plan';
  import { PAIN_LOCATIONS, type HangSession, type PainLocation } from '../lib/domain/types';
  import { PAIN_LABELS } from '../lib/format';
  import Stepper from '../lib/ui/Stepper.svelte';
  import Switch from '../lib/ui/Switch.svelte';

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

  function patch(p: Partial<HangSession>) {
    onChange({ ...$state.snapshot(session), ...p });
  }

  const done = $derived(session.sets.filter((s) => s.completed).length);
  const underLoad = $derived(session.sets.reduce((sum, s) => sum + s.actualSec, 0));
  const edges = $derived([...new Set(session.sets.map((s) => s.edgeMm))].join('/'));
  const meta = $derived(
    [formatShortDate(toIsoDate(new Date(session.datetime))), edges && `${edges} mm`, session.week && `Week ${session.week}`].filter(Boolean).join(' · '),
  );

  function togglePlace(p: PainLocation) {
    const has = session.painLocations.includes(p);
    let next: PainLocation[];
    if (p === 'none') next = has ? [] : ['none'];
    else next = has ? session.painLocations.filter((x) => x !== p) : [...session.painLocations.filter((x) => x !== 'none'), p];
    patch({ painLocations: next });
  }

  // Bound to the stepper only after the user adds a body weight.
  let weight = $state(0);
  $effect(() => {
    weight = session.bodyweightKg ?? lastBodyweight ?? 70;
  });
  $effect(() => {
    if (session.bodyweightKg !== null && weight !== session.bodyweightKg) patch({ bodyweightKg: weight });
  });

  let note = $state('');
  $effect(() => {
    note = session.note;
  });
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

    {#if session.sharpPain}
      <div class="safety" role="alert">
        <div class="safety-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l10 18H2z"></path><path d="M12 10v4M12 17h.01"></path></svg>
          Stop training for today
        </div>
        <p>You reported sharp finger pain, a click or a pop. Rest the hand and skip the next session. If pain, swelling or weakness stays, see a doctor or hand therapist.</p>
      </div>
    {/if}

    <section>
      <div class="sec-head"><span class="strong">Effort (RPE)</span><span class="hint">Optional</span></div>
      <div class="scale ten" role="radiogroup" aria-label="Effort, 1 to 10">
        {#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}
          <button role="radio" aria-checked={session.rpe === n} class:sel={session.rpe === n} onclick={() => patch({ rpe: session.rpe === n ? null : n })}>{n}</button>
        {/each}
      </div>
    </section>

    <section>
      <div class="sec-head"><span class="strong">Pain</span><span class="hint">0 none · 10 worst · Optional</span></div>
      <div class="scale eleven" role="radiogroup" aria-label="Pain, 0 to 10">
        {#each Array.from({ length: 11 }, (_, i) => i) as n (n)}
          <button role="radio" aria-checked={session.painLevel === n} class:sel={session.painLevel === n} onclick={() => patch({ painLevel: session.painLevel === n ? null : n })}>{n}</button>
        {/each}
      </div>
      <div class="chips" role="group" aria-label="Where">
        {#each PAIN_LOCATIONS as p (p)}
          <button aria-pressed={session.painLocations.includes(p)} class:sel={session.painLocations.includes(p)} onclick={() => togglePlace(p)}>{PAIN_LABELS[p]}</button>
        {/each}
      </div>
      <div class="pop">
        <span>Sharp pain, click or pop</span>
        <Switch checked={session.sharpPain} label="Sharp pain, click or pop" onchange={(v) => patch({ sharpPain: v })} />
      </div>
    </section>

    <div class="two">
      <div class="field">
        {#if session.bodyweightKg === null}
          <span class="strong">Body weight</span>
          <button class="add" onclick={() => patch({ bodyweightKg: weight })}>Add</button>
        {:else}
          <Stepper label="Body weight" strong bind:value={weight} step={0.5} min={20} max={250} format={(v) => `${v} kg`} />
        {/if}
      </div>
      <div class="field">
        <label class="strong" for="note">Note</label>
        <input id="note" placeholder="Add a note" bind:value={note} onchange={() => patch({ note })} />
      </div>
    </div>
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
  .safety { display: flex; flex-direction: column; gap: 6px; padding: 16px; background: var(--danger-tint); border: 1px solid var(--danger); }
  .safety-title { display: flex; align-items: center; gap: 10px; color: var(--danger); font-weight: 700; font-size: 17px; }
  .safety p { margin: 0; font-size: 15px; }
  section { display: flex; flex-direction: column; gap: 8px; }
  .sec-head { display: flex; justify-content: space-between; align-items: baseline; }
  .strong { font-weight: 600; }
  .hint { font-size: 13px; color: var(--muted); }
  .scale { display: grid; border: 1px solid var(--divider); }
  .ten { grid-template-columns: repeat(10, 1fr); }
  .eleven { grid-template-columns: repeat(11, 1fr); }
  .scale button { height: 48px; border: 0; background: transparent; font-size: 15px; font-variant-numeric: tabular-nums; padding: 0; }
  .scale button + button { border-left: 1px solid var(--divider); }
  .scale .sel { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 4px; }
  .chips button { min-height: 40px; padding: 0 14px; border: 1px solid var(--divider); background: transparent; font-size: 15px; border-radius: var(--r-1); }
  .chips .sel { border-color: var(--accent); background: var(--accent-tint); font-weight: 600; }
  .pop { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 4px; font-size: 15px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .add { height: 48px; border: 1px dashed var(--divider); background: transparent; color: var(--accent); font-weight: 600; border-radius: var(--r-1); }
  input { height: 48px; padding: 0 12px; background: var(--surface); border: 1px solid var(--divider); border-radius: var(--r-1); font-size: 15px; min-width: 0; }
  .bottom { position: sticky; bottom: 0; padding: 12px var(--sp-5) max(var(--sp-5), env(safe-area-inset-bottom)); background: var(--bg); }
  .done { width: 100%; height: 60px; font-size: 24px; }
</style>
