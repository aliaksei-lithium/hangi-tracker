<script lang="ts">
  // Plan the next training block: pick a start (continue, smaller edge, repeat),
  // optionally an easy week, adjust the values if needed, check the weeks, start.
  import { untrack } from 'svelte';
  import { BLOCK_LENGTHS, blockSets, type BlockChoice, type BlockPlanning } from '../lib/domain/block';
  import { addDays, formatShortDate } from '../lib/domain/dates';
  import { firstTrainingDay, formatDuration } from '../lib/domain/plan';
  import { EDGES_MM, type BlockConfig, type Settings } from '../lib/domain/types';
  import Stepper from '../lib/ui/Stepper.svelte';

  let {
    planning,
    settings,
    blockNumber,
    from,
    onStart,
    onBack,
    onSchedule,
  }: {
    planning: BlockPlanning;
    settings: Settings;
    /** Number of the current block (the new one is the next). */
    blockNumber: number;
    /** First possible day of the new block. */
    from: string;
    onStart: (b: BlockConfig) => Promise<void>;
    onBack: () => void;
    onSchedule: () => void;
  } = $props();

  const CHOICES: { key: BlockChoice; label: string; hint: string }[] = [
    { key: 'continue', label: 'Continue', hint: 'Same edge, from where you are' },
    { key: 'smaller', label: 'Smaller edge', hint: 'One edge down, start easier' },
    { key: 'repeat', label: 'Repeat', hint: 'Same start as this block' },
  ];

  let choice = $state<BlockChoice>(untrack(() => planning.recommended));
  let config = $state<BlockConfig>(untrack(() => ({ ...planning.options[planning.recommended]!, easyWeek: planning.easyWeek })));
  let adjust = $state(false);
  let starting = $state(false);

  function pick(c: BlockChoice) {
    const option = planning.options[c];
    if (!option) return;
    choice = c;
    config = { ...option, weeks: config.weeks, easyWeek: config.easyWeek };
  }

  const finished = $derived(planning.open === 0);
  const fullText = (b: BlockConfig) => `${b.fullEdgeMm} mm · ${b.startSets} × ${b.startHangSec} s`;

  const firstDay = $derived(firstTrainingDay(settings.schedule.days, from));
  const week1 = $derived(config.easyWeek ? addDays(firstDay, 7) : firstDay);
  const weeks = $derived(
    [...(config.easyWeek ? [0] : []), ...Array.from({ length: config.weeks }, (_, i) => i + 1)].map((w) => {
      const full = blockSets(config, 'full', w);
      const light = blockSets(config, 'light', w);
      return { w, full: `${full[0].edgeMm} mm · ${full.length} × ${full[0].hangSec} s`, light: `${light[0].edgeMm} mm · ${light.length} × ${light[0].hangSec} s` };
    }),
  );

  const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const scheduleText = $derived(
    [...settings.schedule.days]
      .sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7))
      .map((d) => `${SHORT_DAYS[d.day]} ${d.type}`)
      .join(', '),
  );

  async function start() {
    starting = true;
    try {
      await onStart($state.snapshot(config));
    } finally {
      starting = false;
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
    <div class="head">
      <h1 class="display">{finished ? 'Next block' : 'New block'}</h1>
      <p class="muted">
        {#if finished}
          Block {blockNumber} done: {planning.done} of {planning.total} sessions.
        {:else}
          You are in {planning.week === 0 ? 'the easy week' : `week ${planning.week}`} of block {blockNumber}, with {planning.open} session{planning.open === 1 ? '' : 's'} left.
        {/if}
      </p>
    </div>

    <section>
      <h2 class="eyebrow">Start from</h2>
      <div class="options" role="radiogroup" aria-label="Start from">
        {#each CHOICES as c (c.key)}
          {@const option = planning.options[c.key]}
          <button
            class="option"
            role="radio"
            aria-checked={choice === c.key}
            class:sel={choice === c.key}
            disabled={!option}
            onclick={() => pick(c.key)}
          >
            <span class="radio" aria-hidden="true"></span>
            <span class="text">
              <span class="label">
                {c.label}
                {#if planning.recommended === c.key}<span class="chip">Recommended</span>{/if}
              </span>
              <span class="sub">{option ? `${fullText(option)} · ${c.hint}` : 'You are on the smallest edge'}</span>
            </span>
          </button>
        {/each}
      </div>
    </section>

    <label class="check">
      <input type="checkbox" bind:checked={config.easyWeek} />
      <span class="text">
        <span>Easy week first</span>
        <span class="sub">One week of light sessions to recover before week 1</span>
      </span>
    </label>

    <section>
      <button class="disclosure" aria-expanded={adjust} onclick={() => (adjust = !adjust)}>
        <span class="text">
          <span>Adjust</span>
          <span class="sub">{fullText(config)} · light {config.lightEdgeMm} mm · rest {formatDuration(config.fullRestSec)} · {config.weeks} weeks</span>
        </span>
        <svg class:up={adjust} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
      </button>
      {#if adjust}
        <div class="adjust">
          <div class="field">
            <span class="flabel">Full session edge</span>
            <div class="segmented" role="radiogroup" aria-label="Full session edge">
              {#each EDGES_MM as e (e)}
                <button role="radio" aria-checked={config.fullEdgeMm === e} class:sel={config.fullEdgeMm === e} onclick={() => (config.fullEdgeMm = e)}>{e}</button>
              {/each}
            </div>
          </div>
          <div class="grid">
            <Stepper label="Start hang" bind:value={config.startHangSec} min={3} max={30} format={(v) => `${v} s`} />
            <Stepper label="Start sets" bind:value={config.startSets} min={1} max={10} />
            <Stepper label="Rest (full)" bind:value={config.fullRestSec} step={15} min={30} max={600} format={formatDuration} />
            <Stepper label="Rest (light)" bind:value={config.lightRestSec} step={15} min={30} max={600} format={formatDuration} />
          </div>
          <div class="field">
            <span class="flabel">Light session edge</span>
            <div class="segmented" role="radiogroup" aria-label="Light session edge">
              {#each EDGES_MM as e (e)}
                <button role="radio" aria-checked={config.lightEdgeMm === e} class:sel={config.lightEdgeMm === e} onclick={() => (config.lightEdgeMm = e)}>{e}</button>
              {/each}
            </div>
          </div>
          <div class="field">
            <span class="flabel">Length</span>
            <div class="segmented five" role="radiogroup" aria-label="Length in weeks">
              {#each BLOCK_LENGTHS as n (n)}
                <button role="radio" aria-checked={config.weeks === n} class:sel={config.weeks === n} onclick={() => (config.weeks = n)}>{n} wk</button>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </section>

    <section>
      <h2 class="eyebrow">The plan</h2>
      <p class="muted small">
        {config.easyWeek ? `Easy week from ${formatShortDate(firstDay)}, week 1 from ${formatShortDate(week1)}.` : `Starts ${formatShortDate(week1)}.`}
        {scheduleText} ·
        <button class="inline-link" onclick={onSchedule}>Change days</button>
      </p>
      <table>
        <thead><tr><th>Wk</th><th>Full</th><th>Light</th></tr></thead>
        <tbody>
          {#each weeks as row (row.w)}
            <tr><td>{row.w === 0 ? 'Easy' : row.w}</td><td>{row.full}</td><td>{row.light}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  </div>

  <div class="bottom">
    {#if !finished}
      <p class="warn">This ends the current block now. Its {planning.open} open session{planning.open === 1 ? '' : 's'} are removed; your log stays.</p>
    {/if}
    <button class="btn btn-primary go" disabled={starting} onclick={start}>Start block</button>
  </div>
</div>

<style>
  .screen { flex: 1; display: flex; flex-direction: column; }
  .topbar { display: flex; padding: 0 4px; }
  .icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; }
  .content { flex: 1; padding: 0 var(--sp-5) var(--sp-6); display: flex; flex-direction: column; gap: 22px; }
  .head { display: flex; flex-direction: column; gap: 4px; }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  h2 { margin: 0; }
  section { display: flex; flex-direction: column; gap: 8px; }
  .muted { color: var(--muted); margin: 0; }
  .small { font-size: var(--fs-sm); }
  .options { display: flex; flex-direction: column; border: 1px solid var(--divider); }
  .option { min-height: 64px; display: flex; align-items: center; gap: 14px; padding: 10px 14px; border: 0; background: transparent; text-align: left; }
  .option + .option { border-top: 1px solid var(--divider); }
  .option:disabled { opacity: 0.5; cursor: default; }
  .radio { width: 22px; height: 22px; flex: none; border-radius: 50%; border: 2px solid var(--muted); }
  .option.sel .radio { border-color: var(--accent); background: var(--accent); box-shadow: inset 0 0 0 4px var(--bg); }
  .text { display: flex; flex-direction: column; gap: 2px; }
  .label { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .sub { font-size: 13px; color: var(--muted); }
  .chip { padding: 1px 8px; background: var(--accent-tint); color: var(--text); font-size: 12px; font-weight: 600; border-radius: var(--r-1); }
  .check { display: flex; align-items: center; gap: 14px; cursor: pointer; min-height: 56px; }
  .check input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); flex: none; }
  .disclosure { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-top: 1px solid var(--divider); border-bottom: 1px solid var(--divider); background: transparent; text-align: left; padding: 6px 0; }
  .disclosure svg { color: var(--muted); flex: none; transition: transform 0.15s; }
  .disclosure svg.up { transform: rotate(180deg); }
  .adjust { display: flex; flex-direction: column; gap: 14px; padding-top: 6px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .flabel { font-size: 13px; color: var(--muted); }
  .segmented { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--divider); }
  .segmented.five { grid-template-columns: repeat(5, 1fr); }
  .segmented button { height: 44px; border: 0; background: transparent; font-size: 15px; padding: 0; }
  .segmented button + button { border-left: 1px solid var(--divider); }
  .segmented .sel { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .inline-link { border: 0; background: transparent; padding: 0; color: var(--accent); font-weight: 600; font-size: inherit; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--divider); }
  td { padding: 8px 8px 8px 0; border-bottom: 1px solid var(--divider); }
  .bottom { position: sticky; bottom: 0; padding: 12px var(--sp-5) max(var(--sp-5), env(safe-area-inset-bottom)); background: var(--bg); box-shadow: var(--shadow-2); display: flex; flex-direction: column; gap: 8px; }
  .warn { margin: 0; font-size: 13px; color: var(--warning); }
  .go { width: 100%; height: 60px; font-size: 24px; }
</style>
