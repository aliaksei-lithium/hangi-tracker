<script lang="ts">
  // The optional fields of a logged session: RPE, pain, body weight, note.
  // Used by the summary after the timer and by the log editor.
  import { PAIN_LOCATIONS, type HangSession, type PainLocation } from '../domain/types';
  import { PAIN_LABELS } from '../format';
  import Stepper from './Stepper.svelte';
  import Switch from './Switch.svelte';

  let {
    session,
    lastBodyweight,
    onChange,
  }: {
    session: HangSession;
    lastBodyweight: number | null;
    onChange: (patch: Partial<HangSession>) => void;
  } = $props();

  function togglePlace(p: PainLocation) {
    const has = session.painLocations.includes(p);
    let next: PainLocation[];
    if (p === 'none') next = has ? [] : ['none'];
    else next = has ? session.painLocations.filter((x) => x !== p) : [...session.painLocations.filter((x) => x !== 'none'), p];
    onChange({ painLocations: next });
  }

  // The stepper binds to a local number; it is saved only once the user added a weight.
  let weight = $state(0);
  $effect(() => {
    weight = session.bodyweightKg ?? lastBodyweight ?? 70;
  });
  $effect(() => {
    if (session.bodyweightKg !== null && weight !== session.bodyweightKg) onChange({ bodyweightKg: weight });
  });

  let note = $state('');
  $effect(() => {
    note = session.note;
  });
</script>

<section>
  <div class="sec-head"><span class="strong">Effort (RPE)</span><span class="hint">Optional</span></div>
  <div class="scale ten" role="radiogroup" aria-label="Effort, 1 to 10">
    {#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}
      <button role="radio" aria-checked={session.rpe === n} class:sel={session.rpe === n} onclick={() => onChange({ rpe: session.rpe === n ? null : n })}>{n}</button>
    {/each}
  </div>
</section>

<section>
  <div class="sec-head"><span class="strong">Pain</span><span class="hint">0 none · 10 worst · Optional</span></div>
  <div class="scale eleven" role="radiogroup" aria-label="Pain, 0 to 10">
    {#each Array.from({ length: 11 }, (_, i) => i) as n (n)}
      <button role="radio" aria-checked={session.painLevel === n} class:sel={session.painLevel === n} onclick={() => onChange({ painLevel: session.painLevel === n ? null : n })}>{n}</button>
    {/each}
  </div>
  <div class="chips" role="group" aria-label="Where">
    {#each PAIN_LOCATIONS as p (p)}
      <button aria-pressed={session.painLocations.includes(p)} class:sel={session.painLocations.includes(p)} onclick={() => togglePlace(p)}>{PAIN_LABELS[p]}</button>
    {/each}
  </div>
  <div class="pop">
    <span>Sharp pain, click or pop</span>
    <Switch checked={session.sharpPain} label="Sharp pain, click or pop" onchange={(v) => onChange({ sharpPain: v })} />
  </div>
</section>

<div class="two">
  <div class="field">
    {#if session.bodyweightKg === null}
      <span class="strong">Body weight</span>
      <button class="add" onclick={() => onChange({ bodyweightKg: weight })}>Add</button>
    {:else}
      <Stepper label="Body weight" strong bind:value={weight} step={0.5} min={20} max={250} format={(v) => `${v} kg`} />
    {/if}
  </div>
  <div class="field">
    <label class="strong" for="note">Note</label>
    <input id="note" placeholder="Add a note" bind:value={note} onchange={() => onChange({ note })} />
  </div>
</div>

<style>
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
  .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .add { height: 48px; border: 1px dashed var(--divider); background: transparent; color: var(--accent); font-weight: 600; border-radius: var(--r-1); }
  input { height: 48px; padding: 0 12px; background: var(--surface); border: 1px solid var(--divider); border-radius: var(--r-1); font-size: 15px; min-width: 0; }
</style>
