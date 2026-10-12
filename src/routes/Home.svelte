<script lang="ts">
  import type { User } from '../lib/api';
  import { daysBetween, formatShortDate, toIsoDate, WEEKDAY_NAMES, weekday } from '../lib/domain/dates';
  import { nextSession, sessionSummary, tooSoonHours, upcomingSessions } from '../lib/domain/plan';
  import type { HangSession, Plan, PlannedSession, Settings } from '../lib/domain/types';
  import { greeting } from '../lib/greeting';
  import Frame from '../lib/ui/Frame.svelte';
  import SuggestionCard, { type SuggestionAction } from '../lib/ui/SuggestionCard.svelte';
  import type { Suggestion } from '../lib/domain/suggest';
  import { typeLabel } from '../lib/format';

  let {
    user,
    plan,
    sessions,
    hangSessions,
    settings,
    suggestion,
    onSuggestion,
    onOpen,
  }: {
    user: User;
    plan: Plan;
    sessions: PlannedSession[];
    hangSessions: HangSession[];
    settings: Settings;
    suggestion: Suggestion | null;
    onSuggestion: (s: Suggestion, a: SuggestionAction) => void;
    onOpen: (id: string) => void;
  } = $props();

  // Re-evaluate time-based text every minute, so the greeting changes while the app is open.
  let now = $state(new Date());
  $effect(() => {
    const id = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(id);
  });

  const next = $derived(nextSession(sessions));
  const upcoming = $derived(upcomingSessions(sessions, 2));
  const soon = $derived(tooSoonHours(hangSessions, settings.schedule.minGapHours, now));
  const lastDone = $derived(
    [...hangSessions].sort((a, b) => b.datetime.localeCompare(a.datetime))[0] ?? null,
  );
  const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

  const lead = $derived.by(() => {
    if (!next) return 'The plan is complete. A new plan comes with a later update.';
    const days = daysBetween(toIsoDate(now), next.date);
    const kind = `${next.type} session`;
    if (days < 0) return `Your ${kind} from ${WEEKDAY_NAMES[weekday(next.date)]} is still open. Do it when you are rested.`;
    if (days === 0) return `Next up is a ${kind} today.`;
    if (days === 1) return `Next up is a ${kind} tomorrow.`;
    const when = days < 7 ? `on ${WEEKDAY_NAMES[weekday(next.date)]}` : `on ${formatShortDate(next.date)}`;
    if (hangSessions.length === 0) return `Next up is a ${kind} ${when}.`;
    const rest = days - 1;
    return `Next up is a ${kind} ${when}. Fingers get ${NUMBERS[rest] ?? rest} more rest day${rest === 1 ? '' : 's'}.`;
  });
  const overdue = $derived(next ? daysBetween(toIsoDate(now), next.date) < 0 : false);
</script>

<div class="strip" aria-hidden="true"></div>
<div class="content">
  <header>
    <h1 class="display">{greeting(user.displayName, now)}</h1>
    <p>{lead}</p>
  </header>

  {#if soon !== null}
    <div class="notice notice-warning" role="status">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3l10 18H2z"></path><path d="M12 10v4M12 17h.01"></path></svg>
      <span><strong>Last session was {soon === 0 ? 'less than an hour' : soon === 1 ? '1 hour' : `${soon} hours`} ago.</strong> Leave at least {settings.schedule.minGapHours} hours between sessions.</span>
    </div>
  {/if}

  {#if suggestion}
    <SuggestionCard {suggestion} onAction={(a) => onSuggestion(suggestion, a)} />
  {/if}

  {#if next}
    <Frame>
      <div class="card-head eyebrow">
        <span class="accent">Next session</span><span>Week {next.week} of {plan.weeks}</span>
      </div>
      <div class="when">
        <span class="display date">{formatShortDate(next.date)}</span>
        <span class="chip">{typeLabel(next.type)}</span>
        {#if overdue}<span class="chip warn">Overdue</span>{/if}
      </div>
      <div class="spec">{sessionSummary(next)}</div>
      <div class="actions">
        <button class="btn btn-primary" onclick={() => onOpen(next.id)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"></path></svg>
          Start session
        </button>
        <button class="btn btn-secondary" onclick={() => onOpen(next.id)}>Edit</button>
      </div>
    </Frame>
  {/if}

  <div class="lists">
    {#if upcoming.length}
      <div class="eyebrow list-title">Upcoming</div>
      {#each upcoming as s (s.id)}
        <button class="item" onclick={() => onOpen(s.id)}>
          <span><strong>{formatShortDate(s.date)}</strong> · {typeLabel(s.type)}</span>
          <span class="muted">{s.sets[0]?.edgeMm} mm · {s.sets.length} × {s.sets[0]?.hangSec} s</span>
        </button>
      {/each}
    {/if}
    {#if lastDone}
      <div class="eyebrow list-title gap">Last completed</div>
      <div class="item static">
        <span><strong>{formatShortDate(toIsoDate(new Date(lastDone.datetime)))}</strong>{lastDone.type ? ` · ${typeLabel(lastDone.type)}` : ''}</span>
        <span class="muted done">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>
          {lastDone.sets.filter((s) => s.completed).length}/{lastDone.plannedSets}{lastDone.rpe ? ` · RPE ${lastDone.rpe}` : ''}
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  .strip {
    height: 64px;
    flex: none;
    background-image: var(--bg-graphic);
    background-size: cover;
    background-position: center 30%;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent);
  }
  .content { padding: var(--sp-1) var(--sp-5) var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-4); }
  header { display: flex; flex-direction: column; gap: 6px; }
  h1 { margin: 0; font-size: var(--fs-2xl); line-height: 1.05; }
  header p { margin: 0; color: var(--muted); }
  .notice strong { font-weight: 600; }
  .card-head { display: flex; justify-content: space-between; align-items: center; }
  .accent { color: var(--accent); }
  .when { display: flex; align-items: center; gap: 10px; }
  .date { font-size: 30px; line-height: 1; }
  .chip { padding: 3px 10px; background: var(--accent-tint); color: var(--text); font-size: 13px; font-weight: 600; border-radius: var(--r-1); }
  .chip.warn { background: var(--warning-tint); color: var(--warning); }
  .spec { font-size: 17px; }
  .actions { display: grid; grid-template-columns: 1fr 104px; gap: var(--sp-2); padding-top: var(--sp-1); }
  .lists { display: flex; flex-direction: column; }
  .list-title { padding-bottom: var(--sp-1); }
  .list-title.gap { padding-top: var(--sp-5); }
  .item { min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 0; border-bottom: 1px solid var(--divider); background: transparent; padding: 0; text-align: left; }
  .item.static { border-bottom: 0; }
  .item strong { font-weight: 600; }
  .muted { color: var(--muted); }
  .done { display: flex; align-items: center; gap: 6px; }
</style>
