// Screen Wake Lock: keeps the screen on while the timer runs. The browser drops the
// lock when the page is hidden, so it is requested again when the page is visible.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function request(): Promise<boolean> {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return false;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => (sentinel = null));
    return true;
  } catch {
    return false; // battery saver, permissions, or not supported
  }
}

function onVisible() {
  if (wanted && document.visibilityState === 'visible' && !sentinel) void request();
}

/** Returns true when the screen will stay on. */
export async function keepScreenOn(): Promise<boolean> {
  wanted = true;
  document.addEventListener('visibilitychange', onVisible);
  return request();
}

export function releaseScreen(): void {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisible);
  void sentinel?.release();
  sentinel = null;
}
