<script module lang="ts">
  export type SuggestionAction = 'accept' | 'repeat' | 'skip' | 'dismiss';
</script>

<script lang="ts">
  // A suggestion with its choices. The plan changes only after the user picks one.
  import type { Suggestion } from '../domain/suggest';

  let { suggestion, onAction }: { suggestion: Suggestion; onAction: (a: SuggestionAction) => void } = $props();
</script>

<div class="card" role="region" aria-label="Suggestion: {suggestion.title}">
  <div class="eyebrow">Suggestion</div>
  <div class="title display">{suggestion.title}</div>
  <p>{suggestion.text}</p>
  {#if suggestion.kind === 'pain'}
    <div class="actions three">
      <button class="btn btn-primary" onclick={() => onAction('repeat')}>Repeat last week</button>
      <button class="btn btn-secondary" onclick={() => onAction('skip')}>Skip next session</button>
      <button class="btn btn-secondary" onclick={() => onAction('dismiss')}>Dismiss</button>
    </div>
  {:else}
    <div class="actions">
      <button class="btn btn-primary" onclick={() => onAction('accept')}>Accept</button>
      <button class="btn btn-secondary" onclick={() => onAction('dismiss')}>Dismiss</button>
    </div>
  {/if}
</div>

<style>
  .card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--accent); background: var(--accent-tint); }
  .eyebrow { color: var(--text); font-weight: 700; }
  .title { font-size: 26px; line-height: 1.1; }
  p { margin: 0; font-size: 15px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .actions.three { grid-template-columns: 1fr 1fr; }
  .actions.three .btn:first-child { grid-column: 1 / -1; }
  .actions.three .btn-secondary { font-size: 18px; padding: 0 8px; }
  .btn { height: 52px; font-size: 20px; }
  .btn-secondary { background: var(--bg); }
</style>
