<script lang="ts">
  // Weekly schedule like a calendar repeat rule: tap a day to cycle off → full → light.
  import type { ScheduleDay, SessionType } from '../domain/types';

  let { days = $bindable() }: { days: ScheduleDay[] } = $props();

  const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const LETTERS: Record<number, string> = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' };
  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const typeOf = (day: number): SessionType | null => days.find((d) => d.day === day)?.type ?? null;

  function cycle(day: number) {
    const t = typeOf(day);
    const rest = days.filter((d) => d.day !== day);
    const next: SessionType | null = t === null ? 'full' : t === 'full' ? 'light' : null;
    days = next ? [...rest, { day, type: next }] : rest;
  }

  const summary = $derived.by(() => {
    if (days.length === 0) return 'Pick at least one day.';
    const list = ORDER.filter((d) => typeOf(d)).map((d) => `${SHORT[d]} ${typeOf(d)}`);
    return `${days.length} session${days.length === 1 ? '' : 's'} a week: ${list.join(', ')}`;
  });
</script>

<div class="picker">
  <div class="days" role="group" aria-label="Training days">
    {#each ORDER as d (d)}
      {@const t = typeOf(d)}
      <button
        type="button"
        class="day {t ?? 'off'}"
        aria-label="{NAMES[d]}: {t ?? 'rest day'}"
        onclick={() => cycle(d)}
      >
        <span class="letter">{LETTERS[d]}</span>
        <span class="kind">{t === 'full' ? 'Full' : t === 'light' ? 'Light' : ''}</span>
      </button>
    {/each}
  </div>
  <p class="summary" aria-live="polite">{summary}</p>
  <p class="hint">Tap a day: rest → full → light.</p>
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 8px; }
  .days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .day {
    height: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 1px solid var(--divider);
    border-radius: var(--r-1);
    background: transparent;
    padding: 0;
  }
  .letter { font-family: var(--font-display); font-weight: 600; font-size: 20px; line-height: 1; }
  .kind { font-size: 11px; font-weight: 600; min-height: 13px; }
  .full { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .light { background: var(--accent-tint); border-color: var(--accent); color: var(--text); }
  .off { color: var(--muted); }
  .summary { margin: 0; font-size: 15px; }
  .hint { margin: 0; font-size: 13px; color: var(--muted); }
</style>
