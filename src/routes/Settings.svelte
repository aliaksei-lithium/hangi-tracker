<script lang="ts">
  import type { User } from '../lib/api';
  import type { EditScope, Settings } from '../lib/domain/types';

  let {
    user,
    settings,
    onChange,
    onLogout,
  }: {
    user: User;
    settings: Settings;
    onChange: (settings: Settings) => void;
    onLogout: () => void;
  } = $props();

  const SCOPES: { value: EditScope | null; label: string }[] = [
    { value: null, label: 'Ask every time' },
    { value: 'this', label: 'Only this session' },
    { value: 'all', label: 'This and all next sessions' },
  ];

  function setScope(value: EditScope | null) {
    const next = $state.snapshot(settings);
    next.rules.editScope = value;
    onChange(next);
  }
</script>

<!-- Placeholder until phase 7 adds all settings groups. -->
<div class="content">
  <h1 class="display">Settings</h1>

  <section>
    <h2 class="eyebrow">Saving edits on the preview</h2>
    <div class="options" role="radiogroup" aria-label="Saving edits on the preview">
      {#each SCOPES as s (s.label)}
        <label class="option">
          <input type="radio" name="scope" checked={settings.rules.editScope === s.value} onchange={() => setScope(s.value)} />
          <span>{s.label}</span>
        </label>
      {/each}
    </div>
  </section>

  <section>
    <h2 class="eyebrow">Signed in as</h2>
    <div>{user.displayName}</div>
  </section>
  <p class="muted">More settings come in a later update.</p>
  <button class="btn btn-secondary" onclick={onLogout}>Log out</button>
</div>

<style>
  .content { padding: var(--sp-6) var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-5); }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  section { display: flex; flex-direction: column; gap: var(--sp-2); }
  h2 { margin: 0; }
  .options { display: flex; flex-direction: column; border: 1px solid var(--divider); }
  .option { min-height: 52px; display: flex; align-items: center; gap: 14px; padding: 8px 14px; cursor: pointer; }
  .option + .option { border-top: 1px solid var(--divider); }
  .option input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); }
  .muted { margin: 0; color: var(--muted); }
</style>
