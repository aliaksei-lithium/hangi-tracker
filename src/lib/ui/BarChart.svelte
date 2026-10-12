<script module lang="ts">
  export interface Bar {
    label: string;
    done: number;
    planned: number;
  }
</script>

<script lang="ts">
  // Columns with a planned outline and a done fill, for time under load per week.
  // Hover, tap or arrow keys show the values of one column.
  let {
    bars,
    current = -1,
    format = (v: number) => String(v),
    label,
  }: { bars: Bar[]; current?: number; format?: (v: number) => string; label: string } = $props();

  const H = 150;
  const AXIS = 22; // room for the week labels
  let width = $state(320);
  let active = $state<number | null>(null);

  const max = $derived(Math.max(1, ...bars.map((b) => Math.max(b.done, b.planned))));
  const slot = $derived(width / Math.max(1, bars.length));
  const barW = $derived(Math.min(24, slot * 0.6));
  const y = (v: number) => (H - AXIS) * (1 - v / max);

  /** Column path with a 4px rounded top and a square base. */
  function column(x: number, value: number): string {
    const top = y(value);
    const base = H - AXIS;
    const r = Math.min(4, (base - top) / 2, barW / 2);
    if (base - top < 1) return '';
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${base}Z`;
  }

  function pick(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left) / slot);
    active = i >= 0 && i < bars.length ? i : null;
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') active = Math.min(bars.length - 1, (active ?? -1) + 1);
    else if (e.key === 'ArrowLeft') active = Math.max(0, (active ?? bars.length) - 1);
    else return;
    e.preventDefault();
  }
</script>

<div class="chart" bind:clientWidth={width}>
  <!-- The chart takes focus so arrow keys can move the tooltip; the same values are in tables. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    height={H}
    role="img"
    aria-label={label}
    tabindex="0"
    onpointermove={pick}
    onpointerdown={pick}
    onpointerleave={() => (active = null)}
    onkeydown={key}
    onblur={() => (active = null)}
  >
    <path d="M0 {H - AXIS + 0.5}H{width}" stroke="var(--divider)" />
    {#each bars as b, i (i)}
      {@const x = i * slot + (slot - barW) / 2}
      <path d={column(x, b.planned)} fill="none" stroke="var(--accent)" stroke-width="1" opacity={active === null || active === i ? 1 : 0.5} />
      <path d={column(x, b.done)} fill="var(--accent)" opacity={active === null || active === i ? 1 : 0.5} />
      <text x={i * slot + slot / 2} y={H - 6} text-anchor="middle" class:now={i === current}>{b.label}</text>
    {/each}
  </svg>
  {#if active !== null}
    {@const b = bars[active]}
    <div class="tip" style="left: {Math.min(Math.max(active * slot + slot / 2, 70), width - 70)}px">
      <strong>{format(b.done)}</strong> done · {format(b.planned)} planned
      <span>{b.label}</span>
    </div>
  {/if}
</div>

<style>
  .chart { position: relative; width: 100%; }
  svg { display: block; overflow: visible; touch-action: pan-y; }
  svg:focus { outline: none; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
  text { font-size: 12px; fill: var(--muted); font-family: var(--font-ui); }
  text.now { fill: var(--text); font-weight: 600; }
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
  }
  .tip strong { font-weight: 600; font-variant-numeric: tabular-nums; }
  .tip span { color: var(--muted); font-size: 12px; }
</style>
