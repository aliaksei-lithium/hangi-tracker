<script lang="ts">
  // Number control with − and + buttons, 48 px targets.
  let {
    label,
    value = $bindable(),
    step = 1,
    min = -Infinity,
    max = Infinity,
    format = (v: number) => String(v),
    strong = false,
  }: {
    label: string;
    value: number;
    step?: number;
    min?: number;
    max?: number;
    format?: (v: number) => string;
    /** Bold label, as used on the summary screen. */
    strong?: boolean;
  } = $props();

  const set = (v: number) => (value = Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
</script>

<div class="field">
  <span class="label" class:strong>{label}</span>
  <div class="stepper" role="group" aria-label={label}>
    <button type="button" aria-label="Decrease {label}" disabled={value <= min} onclick={() => set(value - step)}>−</button>
    <output aria-live="polite">{format(value)}</output>
    <button type="button" aria-label="Increase {label}" disabled={value >= max} onclick={() => set(value + step)}>+</button>
  </div>
</div>

<style>
  .field { display: flex; flex-direction: column; gap: 6px; }
  .label { font-size: 13px; color: var(--muted); }
  .label.strong { font-size: inherit; color: inherit; font-weight: 600; }
  .stepper { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; background: var(--surface-2); border-radius: var(--r-1); }
  button { height: 48px; border: 0; background: transparent; font-size: 22px; }
  button:disabled { opacity: 0.35; cursor: default; }
  output { white-space: nowrap; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
