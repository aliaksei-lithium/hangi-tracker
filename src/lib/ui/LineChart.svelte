<script module lang="ts">
  export interface Series {
    name: string;
    color: string;
    dashed?: boolean;
    values: (number | null)[];
  }
</script>

<script lang="ts">
  // Line chart on one y-scale. A crosshair snaps to the nearest point and the tooltip
  // lists every series there. Hover, tap or arrow keys move it.
  let {
    labels,
    series,
    yMin,
    yMax,
    ticks,
    unit = '',
    label,
    height = 130,
  }: {
    labels: string[];
    series: Series[];
    yMin: number;
    yMax: number;
    ticks: number[];
    unit?: string;
    label: string;
    height?: number;
  } = $props();

  const LEFT = 28; // y tick labels
  const PAD = 8;
  const BOTTOM = 18; // first and last date
  let width = $state(320);
  let active = $state<number | null>(null);

  const n = $derived(labels.length);
  const x = (i: number) => LEFT + PAD + (n <= 1 ? (width - LEFT - 2 * PAD) / 2 : (i * (width - LEFT - 2 * PAD)) / (n - 1));
  const y = (v: number) => PAD + (height - 2 * PAD - BOTTOM) * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));

  /** Path through the points; a missing value breaks the line. */
  function path(values: (number | null)[]): string {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function pick(e: PointerEvent) {
    if (n === 0) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    active = best;
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') active = Math.min(n - 1, (active ?? -1) + 1);
    else if (e.key === 'ArrowLeft') active = Math.max(0, (active ?? n) - 1);
    else return;
    e.preventDefault();
  }

  const showDots = $derived(n <= 24);
</script>

<div class="chart" bind:clientWidth={width}>
  <!-- The chart takes focus so arrow keys can move the tooltip; the same values are in tables. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    {height}
    role="img"
    aria-label={label}
    tabindex="0"
    onpointermove={pick}
    onpointerdown={pick}
    onpointerleave={() => (active = null)}
    onkeydown={key}
    onblur={() => (active = null)}
  >
    {#each ticks as t (t)}
      <path d="M{LEFT} {Math.round(y(t)) + 0.5}H{width}" stroke="var(--divider)" />
      <text class="tick" x={LEFT - 6} y={y(t) + 4} text-anchor="end">{t}</text>
    {/each}
    {#if n > 0}
      <text class="tick" x={x(0)} y={height - 2} text-anchor={n > 1 ? 'start' : 'middle'}>{labels[0]}</text>
      {#if n > 1}<text class="tick" x={x(n - 1)} y={height - 2} text-anchor="end">{labels[n - 1]}</text>{/if}
    {/if}
    {#if active !== null}
      <path d="M{x(active)} {PAD}V{height - PAD - BOTTOM}" stroke="var(--muted)" stroke-width="1" />
    {/if}
    {#each series as s (s.name)}
      <path d={path(s.values)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={s.dashed ? '6 4' : undefined} />
      {#if showDots}
        {#each s.values as v, i (i)}
          {#if v !== null}
            <circle cx={x(i)} cy={y(v)} r={active === i ? 5 : 4} fill={s.color} stroke="var(--bg)" stroke-width="2" />
          {/if}
        {/each}
      {/if}
    {/each}
  </svg>
  {#if active !== null}
    <div class="tip" style="left: {Math.min(Math.max(x(active), 70), width - 70)}px">
      <span class="date">{labels[active]}</span>
      {#each series as s (s.name)}
        <span class="row">
          <i style="border-top: 2px {s.dashed ? 'dashed' : 'solid'} {s.color}"></i>
          <strong>{s.values[active] ?? '–'}{s.values[active] !== null ? unit : ''}</strong>
          {s.name}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .chart { position: relative; width: 100%; }
  svg { display: block; overflow: visible; touch-action: pan-y; }
  svg:focus { outline: none; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
  .tick { font-size: 11px; fill: var(--muted); font-family: var(--font-ui); font-variant-numeric: tabular-nums; }
  .tip {
    position: absolute;
    top: -8px;
    transform: translate(-50%, -100%);
    background: var(--surface);
    border: 1px solid var(--divider);
    box-shadow: var(--shadow-1);
    padding: 6px 10px;
    font-size: 13px;
    white-space: nowrap;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .date { color: var(--muted); font-size: 12px; }
  .row { display: flex; align-items: center; gap: 6px; color: var(--muted); }
  .row i { width: 14px; display: inline-block; }
  .row strong { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
