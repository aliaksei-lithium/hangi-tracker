<script lang="ts">
  import { login, NetworkError, type User } from '../lib/api';

  let { onLogin, onGuest }: { onLogin: (user: User) => Promise<void>; onGuest: () => Promise<void> } = $props();

  let password = $state('');
  let visible = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!password || busy) return;
    busy = true;
    error = null;
    try {
      const user = await login(password);
      if (user) await onLogin(user);
      else error = 'Password is incorrect.';
    } catch (e) {
      error = e instanceof NetworkError ? 'No connection. Try again when you are online.' : 'Something went wrong. Try again.';
    } finally {
      busy = false;
    }
  }
</script>

<form class="login" onsubmit={submit}>
  <div class="hero" aria-hidden="true"></div>
  <div class="body">
    <div class="brand">
      <img src="/favicon.svg" width="44" height="44" alt="" />
      <h1 class="display">Hangi Tracker</h1>
      <p>Hangboard sessions, timed and logged.</p>
    </div>

    <div class="fields">
      <label for="password">Password</label>
      <div class="field" class:invalid={error === 'Password is incorrect.'}>
        <input
          id="password"
          type={visible ? 'text' : 'password'}
          autocomplete="current-password"
          bind:value={password}
          oninput={() => (error = null)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'login-error' : undefined}
        />
        <button
          type="button"
          class="eye"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onclick={() => (visible = !visible)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path>
            <circle cx="12" cy="12" r="3"></circle>
            {#if visible}<path d="M3 3l18 18"></path>{/if}
          </svg>
        </button>
      </div>
      {#if error}
        <div id="login-error" class="notice notice-danger" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path>
          </svg>
          <span>{error}</span>
        </div>
      {/if}
    </div>

    <div class="spacer"></div>
    <button class="btn btn-primary" type="submit" disabled={busy || !password}>
      {busy ? 'Checking…' : 'Log in'}
    </button>
    <button class="guest" type="button" onclick={onGuest}>
      <span>Try it without an account</span>
      <span class="sub">Sample data. Stays in this browser.</span>
    </button>
  </div>
</form>

<style>
  .login { flex: 1; display: flex; flex-direction: column; }
  .hero {
    height: 300px;
    flex: none;
    background-image: var(--bg-graphic);
    background-size: cover;
    background-position: center;
    -webkit-mask-image: linear-gradient(#000 55%, transparent);
    mask-image: linear-gradient(#000 55%, transparent);
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: 0 var(--sp-6) max(var(--sp-8), env(safe-area-inset-bottom));
  }
  .brand { display: flex; flex-direction: column; gap: var(--sp-2); }
  .brand img { display: block; }
  h1 { margin: 0; padding-top: var(--sp-2); font-size: 44px; line-height: 1; letter-spacing: -0.01em; }
  .brand p { margin: 0; color: var(--muted); }
  .fields { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: var(--fs-sm); color: var(--muted); }
  .field {
    height: 52px;
    display: flex;
    align-items: center;
    padding: 0 6px 0 14px;
    background: var(--surface);
    border: 1px solid var(--divider);
    border-radius: var(--r-1);
  }
  .field:focus-within { border-color: var(--accent); }
  .field.invalid { border-color: var(--danger); }
  .field input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font-size: var(--fs-lg);
  }
  .eye {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--muted);
  }
  .notice { margin-top: 10px; }
  .spacer { flex: 1; }
  .guest { margin-top: calc(-1 * var(--sp-2)); min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 0; background: transparent; color: var(--accent); font-weight: 600; font-size: 16px; }
  .guest .sub { color: var(--muted); font-weight: 400; font-size: 13px; }
</style>
