<script lang="ts">
  let { onBack }: { onBack: () => void } = $props();
</script>

<!-- Replaced by the real timer in phase 3. -->
<div class="timer">
  <p class="display big">Timer</p>
  <p>The timer comes in the next update. Your session is saved and ready.</p>
  <button class="btn btn-secondary" onclick={onBack}>Back to home</button>
</div>

<style>
  .timer {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    padding: var(--sp-6);
    text-align: center;
    background: var(--timer-bg);
    color: var(--timer-text);
  }
  .big { margin: 0; font-size: var(--fs-phase); color: var(--ph-ready); }
  p { margin: 0; color: var(--timer-muted); }
  .btn { color: var(--timer-text); border-color: var(--timer-muted); }
</style>
