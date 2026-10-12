<script lang="ts">
  import type { User } from '../lib/api';

  let { user, onLogout }: { user: User; onLogout: () => void } = $props();
</script>

<!-- Placeholder until phase 7 adds all settings groups. -->
<div class="content">
  <h1 class="display">Settings</h1>
  <div class="row">
    <span class="eyebrow">Signed in as</span>
    <span>{user.displayName}</span>
  </div>
  <p class="muted">More settings come in a later update.</p>
  <button class="btn btn-secondary" onclick={onLogout}>Log out</button>
</div>

<style>
  .content { padding: var(--sp-6) var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-4); }
  h1 { margin: 0; font-size: var(--fs-2xl); }
  .row { display: flex; flex-direction: column; gap: var(--sp-1); padding-bottom: var(--sp-3); border-bottom: 1px solid var(--divider); }
  .muted { margin: 0; color: var(--muted); }
</style>
