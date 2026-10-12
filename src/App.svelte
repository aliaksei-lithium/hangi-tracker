<script lang="ts">
  import { fetchMe, logout, NetworkError, type User } from './lib/api';
  import Home from './routes/Home.svelte';
  import Login from './routes/Login.svelte';
  import Settings from './routes/Settings.svelte';

  type Tab = 'home' | 'settings';

  let user = $state<User | null>(null);
  let checked = $state(false);
  let offline = $state(false);
  let tab = $state<Tab>('home');

  async function check() {
    offline = false;
    try {
      user = await fetchMe();
    } catch (e) {
      // Offline support with a cached user comes with the local store in phase 4.
      if (e instanceof NetworkError) offline = true;
      else throw e;
    } finally {
      checked = true;
    }
  }
  check();

  async function doLogout() {
    await logout().catch(() => {});
    user = null;
    tab = 'home';
  }
</script>

{#if !checked}
  <div class="center" aria-busy="true"></div>
{:else if offline}
  <div class="center">
    <p>No connection. Hangi Tracker needs the network for now.</p>
    <button class="btn btn-secondary" onclick={check}>Try again</button>
  </div>
{:else if !user}
  <Login onLogin={(u) => (user = u)} />
{:else}
  <main>
    {#if tab === 'home'}
      <Home {user} />
    {:else}
      <Settings {user} onLogout={doLogout} />
    {/if}
  </main>
  <nav aria-label="Main">
    <button class:active={tab === 'home'} aria-current={tab === 'home' ? 'page' : undefined} onclick={() => (tab = 'home')}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>
      Home
    </button>
    <button disabled title="Coming in a later update">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20V11M10 20V5M16 20v-6M2 20h20"></path></svg>
      Progress
    </button>
    <button class:active={tab === 'settings'} aria-current={tab === 'settings' ? 'page' : undefined} onclick={() => (tab = 'settings')}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"></path><circle cx="15" cy="6" r="2"></circle><circle cx="9" cy="12" r="2"></circle><circle cx="17" cy="18" r="2"></circle></svg>
      Settings
    </button>
  </nav>
{/if}

<style>
  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    padding: var(--sp-6);
    text-align: center;
  }
  main { flex: 1; display: flex; flex-direction: column; padding-top: env(safe-area-inset-top); }
  nav {
    position: sticky;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid var(--divider);
    background: var(--bg);
    padding-bottom: env(safe-area-inset-bottom);
  }
  nav button {
    height: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: var(--fs-xs);
  }
  nav button.active { color: var(--accent); font-weight: 600; box-shadow: inset 0 2px 0 var(--accent); }
  nav button:disabled { opacity: 0.45; cursor: default; }
</style>
