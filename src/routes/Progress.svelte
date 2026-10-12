<script lang="ts">
  import { daysBetween, formatShortDate, toIsoDate } from '../lib/domain/dates';
  import { formatDuration } from '../lib/domain/plan';
  import { calendar, planVsActual, records, sessionSeries, timeUnderLoad, weekTable, weeklyLoad } from '../lib/domain/progress';
  import { EDGES_MM, type HangSession, type Plan, type PlannedSession } from '../lib/domain/types';
  import { typeLabel } from '../lib/format';
  import BarChart from '../lib/ui/BarChart.svelte';
  import LineChart from '../lib/ui/LineChart.svelte';
  import Log from './Log.svelte';
  import SuggestionCard, { type SuggestionAction } from '../lib/ui/SuggestionCard.svelte';
  import type { Suggestion } from '../lib/domain/suggest';

  // Everything here comes from the log and the plan; nothing needs input.
  let {
    plan,
    planned,
    log,
    suggestions,
    onSuggestion,
    onOpen,
    onAdd,
  }: {
    plan: Plan;
    planned: PlannedSession[];
    log: HangSession[];
    suggestions: Suggestion[];
    onSuggestion: (s: Suggestion, a: SuggestionAction) => void;
    onOpen: (id: string) => void;
    onAdd: () => void;
  } = $props();

  const today = toIsoDate(new Date());
  const currentWeek = $derived(Math.floor(daysBetween(plan.startDate, today) / 7) + 1);

  const prs = $derived(records(log, [...EDGES_MM].reverse()));
  const load = $derived(weeklyLoad(plan, planned, log));
  const points = $derived(sessionSeries(log));
  const dates = $derived(points.map((p) => formatShortDate(p.date)));
  const rows = $derived(planVsActual(planned, log, today).slice(0, 8));
  const weeks = $derived(weekTable(plan, log));

  let month = $state(today.slice(0, 7));
  const days = $derived(calendar(month, planned, log, today));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  const STATUS = { done: 'Done', skipped: 'Skipped', missed: 'Missed', modified: 'Modified' } as const;

  function rowDetail(r: (typeof rows)[number]): string {
    const p = r.planned;
    if (r.entry) {
      const done = r.entry.sets.filter((s) => s.completed).length;
      const edges = [...new Set(r.entry.sets.map((s) => s.edgeMm))].join('/');
      return `${typeLabel(p.type)} · ${edges} mm · ${done}/${r.entry.plannedSets} sets`;
    }
    return `${typeLabel(p.type)} · Week ${p.week} · ${p.sets[0]?.edgeMm} mm · ${p.sets.length} × ${p.sets[0]?.hangSec} s`;
  }
</script>

<div class="content">
  <h1 class="display">Progress</h1>

  {#each suggestions as s (s.key)}
    <SuggestionCard suggestion={s} onAction={(a) => onSuggestion(s, a)} />
  {/each}

  {#if log.length === 0}
    <p class="muted">Charts and records fill in on their own after your first session.</p>
  {:else}
    <section>
      <h2 class="eyebrow">Personal records</h2>
      <div class="prs">
        {#each prs.edges as r (r.edgeMm)}
          <div>
            <span class="k">{r.edgeMm} mm</span>
            <span class="v display">{r.bestSec === null ? '–' : `${r.bestSec} s`}</span>
            <span class="sub">{r.date ? formatShortDate(r.date) : 'not yet'}</span>
          </div>
        {/each}
      </div>
      {#if prs.volume}
        <div class="volume">
          <span>Best volume, one session</span>
          <span><strong>{formatDuration(prs.volume.sec)}</strong> <span class="muted">· {formatShortDate(prs.volume.date)}</span></span>
        </div>
      {/if}
    </section>

    <section>
      <div class="head"><h2 class="title">Time under load per week</h2><span class="muted small">m:ss</span></div>
      <BarChart
        label="Time under load per plan week, done and planned"
        bars={load.map((w) => ({ label: `W${w.week}`, done: w.doneSec, planned: w.plannedSec }))}
        current={currentWeek - 1}
        format={formatDuration}
      />
      <div class="legend">
        <span><i class="swatch fill"></i>Done</span>
        <span><i class="swatch outline"></i>Planned</span>
      </div>
    </section>

    <!-- Two small charts instead of one with two y-scales. -->
    <section>
      <h2 class="title">Edge per session</h2>
      <LineChart label="Smallest edge used in each session, in millimetres" labels={dates} series={[{ name: 'Edge', color: 'var(--accent)', values: points.map((p) => p.edgeMm) }]} yMin={15} yMax={30} ticks={[15, 20, 25, 30]} unit=" mm" height={118} />
    </section>
    <section>
      <h2 class="title">Longest hang per session</h2>
      <LineChart label="Longest completed hang in each session, in seconds" labels={dates} series={[{ name: 'Hang', color: 'var(--accent)', values: points.map((p) => p.hangSec) }]} yMin={0} yMax={Math.max(10, ...points.map((p) => p.hangSec))} ticks={[0, 5, 10]} unit=" s" height={118} />
    </section>

    <section>
      <h2 class="title">Effort and pain per session</h2>
      <LineChart
        label="RPE and pain level for each session, on a 0 to 10 scale"
        labels={dates}
        series={[
          { name: 'RPE', color: 'var(--series-1)', values: points.map((p) => p.rpe) },
          { name: 'Pain', color: 'var(--series-2)', dashed: true, values: points.map((p) => p.pain) },
        ]}
        yMin={0}
        yMax={10}
        ticks={[0, 5, 10]}
        height={148}
      />
      <div class="legend">
        <span><i class="key" style="border-top: 2px solid var(--series-1)"></i>RPE</span>
        <span><i class="key" style="border-top: 2px dashed var(--series-2)"></i>Pain</span>
        <span>scale 0–10</span>
      </div>
    </section>
  {/if}

  <section>
    <div class="head">
      <h2 class="title">{MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</h2>
      <span class="nav">
        <button aria-label="Previous month" onclick={() => shiftMonth(-1)}>‹</button>
        <button aria-label="Next month" onclick={() => shiftMonth(1)}>›</button>
      </span>
    </div>
    <div class="cal" role="grid" aria-label="Calendar">
      {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d, i (i)}<span class="dow">{d}</span>{/each}
      {#each days as d (d.date)}
        <span class="day {d.mark ?? ''}" class:out={!d.inMonth} class:today={d.today} title={d.mark ?? undefined}>{d.day}</span>
      {/each}
    </div>
    <div class="legend">
      <span><i class="swatch fill"></i>Done</span>
      <span><i class="swatch dashed"></i>Planned</span>
      <span><s>1</s> Skipped</span>
      <span><i class="swatch missed"></i>Missed</span>
    </div>
  </section>

  {#if rows.length}
    <section>
      <h2 class="title">Plan vs actual</h2>
      <div class="list">
        {#each rows as r (r.id)}
          <div class="pva">
            <span class="col"><strong>{formatShortDate(r.date)}</strong><span class="muted small">{rowDetail(r)}</span></span>
            <span class="status {r.status}">{STATUS[r.status]}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if weeks.length}
    <section>
      <h2 class="title">Weeks</h2>
      <table>
        <thead><tr><th>Wk</th><th>Edge</th><th>Hang</th><th>Sets</th><th>Notes</th></tr></thead>
        <tbody>
          {#each weeks as w (w.week)}
            <tr class:now={w.week === currentWeek}>
              <td>{w.week}</td><td>{w.edgeMm} mm</td><td>{w.hangSec} s</td><td>{w.setsDone}</td><td class="notes">{w.notes || (w.sessions > 1 ? `${w.sessions} sessions` : '')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section>
    <Log {log} {onOpen} {onAdd} />
  </section>
  <p class="muted small">Total time under load: {formatDuration(log.reduce((s, x) => s + timeUnderLoad(x), 0))}</p>
</div>

<style>
  .content { padding: var(--sp-6) var(--sp-5) var(--sp-8); display: flex; flex-direction: column; gap: 32px; }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  h2 { margin: 0; }
  .title { font-size: var(--fs-md); font-weight: 600; font-family: var(--font-ui); }
  section { display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; }
  .muted { color: var(--muted); margin: 0; }
  .small { font-size: 13px; }
  .prs { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--divider); }
  .prs > div { padding: 10px; display: flex; flex-direction: column; }
  .prs > div + div { border-left: 1px solid var(--divider); }
  .k { font-size: 13px; color: var(--muted); }
  .v { font-size: 26px; font-variant-numeric: tabular-nums; }
  .sub { font-size: 12px; color: var(--muted); }
  .volume { display: flex; justify-content: space-between; padding: 12px; border: 1px solid var(--divider); }
  .volume strong { font-weight: 600; font-variant-numeric: tabular-nums; }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--muted); }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .swatch { width: 12px; height: 12px; display: inline-block; }
  .swatch.fill { background: var(--accent); }
  .swatch.outline { border: 1px solid var(--accent); }
  .swatch.dashed { border: 1px dashed var(--muted); }
  .swatch.missed { border: 1px solid var(--warning); background: var(--warning-tint); }
  .key { width: 18px; display: inline-block; }
  .nav { display: flex; gap: 4px; }
  .nav button { width: 44px; height: 44px; border: 0; background: transparent; color: var(--muted); font-size: 22px; }
  .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; }
  .dow { font-size: 12px; color: var(--muted); }
  .day { height: 44px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-variant-numeric: tabular-nums; }
  .day.out { color: var(--muted); opacity: 0.5; }
  .day.today { font-weight: 700; box-shadow: inset 0 -2px 0 var(--text); }
  .day.done { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .day.planned { border: 1px dashed var(--muted); }
  .day.skipped { text-decoration: line-through; color: var(--muted); }
  .day.missed { border: 1px solid var(--warning); background: var(--warning-tint); color: var(--warning); }
  .list { display: flex; flex-direction: column; }
  .pva { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--divider); }
  .col { display: flex; flex-direction: column; }
  .col strong { font-weight: 600; }
  .status { padding: 3px 10px; font-size: 13px; font-weight: 600; border: 1px solid var(--divider); white-space: nowrap; }
  .status.done { border-color: var(--success); color: var(--success); }
  .status.modified { border-color: var(--accent); background: var(--accent-tint); }
  .status.skipped { color: var(--muted); }
  .status.missed { border-color: var(--warning); color: var(--warning); background: var(--warning-tint); }
  table { width: 100%; border-collapse: collapse; font-size: 15px; font-variant-numeric: tabular-nums; }
  th, td { padding-right: 12px; }
  th { text-align: left; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 8px 0; border-bottom: 1px solid var(--divider); }
  td { padding: 10px 0; border-bottom: 1px solid var(--divider); }
  tr.now td { font-weight: 700; background: var(--accent-tint); }
  .notes { color: var(--muted); font-size: 13px; }
</style>
