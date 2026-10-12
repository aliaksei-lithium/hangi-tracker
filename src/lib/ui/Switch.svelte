<script lang="ts">
  let { checked = $bindable(), label }: { checked: boolean; label: string } = $props();
</script>

<button type="button" role="switch" aria-checked={checked} aria-label={label} class:on={checked} onclick={() => (checked = !checked)}>
  <span></span>
</button>

<style>
  button {
    width: 52px;
    height: 32px;
    flex: none;
    border: 0;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--divider);
    display: flex;
    align-items: center;
    padding: 3px;
    transition: background 0.15s;
  }
  span { width: 26px; height: 26px; border-radius: 50%; background: var(--muted); transition: transform 0.15s; }
  .on { background: var(--accent); box-shadow: none; }
  .on span { background: var(--on-accent); transform: translateX(20px); }
</style>
