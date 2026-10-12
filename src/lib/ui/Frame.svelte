<script lang="ts">
  // Hairline card with "+" registration marks on the corners (Industry design system).
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="frame">
  <i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>
  {@render children()}
</div>

<style>
  .frame {
    position: relative;
    border: 1px solid var(--divider);
    padding: 18px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  i {
    position: absolute;
    width: 11px;
    height: 11px;
    background:
      linear-gradient(var(--mark), var(--mark)) 5px 0 / 1px 100% no-repeat,
      linear-gradient(var(--mark), var(--mark)) 0 5px / 100% 1px no-repeat;
  }
  .tl { top: -6px; left: -6px; }
  .tr { top: -6px; right: -6px; }
  .bl { bottom: -6px; left: -6px; }
  .br { bottom: -6px; right: -6px; }
</style>
