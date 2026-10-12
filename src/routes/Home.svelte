<script lang="ts">
  import type { User } from '../lib/api';
  import { greeting } from '../lib/greeting';
  import Frame from '../lib/ui/Frame.svelte';

  let { user }: { user: User } = $props();

  // Re-evaluate the greeting every minute so it changes from afternoon to evening while open.
  let now = $state(new Date());
  $effect(() => {
    const id = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(id);
  });
</script>

<div class="strip" aria-hidden="true"></div>
<div class="content">
  <header>
    <h1 class="display">{greeting(user.displayName, now)}</h1>
    <p>Your training plan comes in the next update. The card below shows how a session will look.</p>
  </header>

  <!-- Placeholder until phase 2 generates the plan. Values are a sample from the design. -->
  <Frame>
    <div class="card-head eyebrow">
      <span class="accent">Next session</span><span>Sample</span>
    </div>
    <div class="when">
      <span class="display date">Week 1</span>
      <span class="chip">Full</span>
    </div>
    <div class="spec">20 mm · 5 × 5 s · rest 3:00 · warm-up on</div>
    <div class="actions">
      <button class="btn btn-primary" disabled>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"></path></svg>
        Start session
      </button>
      <button class="btn btn-secondary" disabled>Edit</button>
    </div>
  </Frame>
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
  .card-head { display: flex; justify-content: space-between; align-items: center; }
  .accent { color: var(--accent); }
  .when { display: flex; align-items: center; gap: 10px; }
  .date { font-size: 30px; line-height: 1; }
  .chip { padding: 3px 10px; background: var(--accent-tint); color: var(--text); font-size: 13px; font-weight: 600; border-radius: var(--r-1); }
  .spec { font-size: 17px; }
  .actions { display: grid; grid-template-columns: 1fr 104px; gap: var(--sp-2); padding-top: var(--sp-1); }
</style>
