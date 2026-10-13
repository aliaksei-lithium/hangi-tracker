<script lang="ts">
  // Bottom sheet to change the weekly schedule. Nothing changes until Save.
  import { untrack } from 'svelte';
  import type { ScheduleDay } from '../domain/types';
  import SchedulePicker from './SchedulePicker.svelte';

  let {
    days,
    onSave,
    onClose,
  }: { days: ScheduleDay[]; onSave: (days: ScheduleDay[]) => Promise<void>; onClose: () => void } = $props();

  let draft = $state<ScheduleDay[]>(untrack(() => days.map((d) => ({ ...d }))));
  let saving = $state(false);
  const key = (list: ScheduleDay[]) => JSON.stringify([...list].sort((a, b) => a.day - b.day));
  const changed = $derived(key(draft) !== key(days));

  async function save() {
    saving = true;
    try {
      await onSave($state.snapshot(draft));
      onClose();
    } finally {
      saving = false;
    }
  }
</script>

<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
    <h2 id="schedule-title" class="display">Weekly schedule</h2>
    <SchedulePicker bind:days={draft} />
    <p class="note">Open sessions move to these days from today. Done sessions stay. One-off edits to future sessions are dropped.</p>
    <div class="actions">
      <button class="btn btn-secondary" onclick={onClose}>Cancel</button>
      <button class="btn btn-primary" disabled={saving || !changed || draft.length === 0} onclick={save}>Save</button>
    </div>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(14, 15, 16, 0.55); display: flex; align-items: flex-end; justify-content: center; z-index: 20; }
  .sheet { width: 100%; max-width: 560px; background: var(--surface); box-shadow: var(--shadow-3); padding: 24px 20px max(34px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 16px; }
  h2 { margin: 0; font-size: 28px; }
  .note { margin: 0; font-size: 13px; color: var(--muted); }
  .actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; }
</style>
