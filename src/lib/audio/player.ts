// Sound for the timer.
//
// Beeps are scheduled ahead on the Web Audio clock for the whole rest of the session,
// so they play on time even when the page's JavaScript is throttled (tab in the
// background, screen locked). Any change to the timer (pause, +10 s, skip) cancels
// them and schedules again.
//
// iOS notes:
// - There is no <audio> element and no Media Session metadata on purpose: either one
//   makes iOS list the app as playing media (lock screen and Control Center player).
//   The price is that iOS stops the beeps when the screen is locked or the app is in
//   the background; the screen wake lock keeps the timer in front instead.
// - The audio session type is "playback", so the beeps also play with the ring/silent
//   switch set to silent. Web Audio alone is muted by that switch.
// - An installed app lives for days, and iOS interrupts its AudioContext whenever the
//   app goes to the background. An old context often stays silent even after
//   `resume()`, so every unlock makes a new one.

import type { Signal, SignalKind } from '../domain/timer';

type Tone = { freq: number; at: number; dur: number };

// Times are seconds after the signal time.
const TONES: Record<SignalKind, Tone[]> = {
  tick: [{ freq: 880, at: 0, dur: 0.12 }],
  go: [{ freq: 1320, at: 0, dur: 0.45 }],
  stop: [
    { freq: 990, at: 0, dur: 0.18 },
    { freq: 660, at: 0.22, dur: 0.35 },
  ],
  warn: [
    { freq: 990, at: 0, dur: 0.1 },
    { freq: 990, at: 0.16, dur: 0.1 },
  ],
  done: [
    { freq: 660, at: 0, dur: 0.18 },
    { freq: 880, at: 0.22, dur: 0.18 },
    { freq: 1320, at: 0.44, dur: 0.5 },
  ],
};

const VOICE_TEXT = {
  get_ready: 'Get ready',
  hang: 'Hang',
  rest: 'Rest',
  next_set: 'Next set',
} as const;

type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';

/** Safari 16.4+. Without it the ring/silent switch mutes Web Audio. */
function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // not supported in this version
  }
}

class Player {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private nodes: OscillatorNode[] = [];

  /** Called when sound starts to run (after an unlock or an interruption). `unlock` clears it. */
  onRunning: (() => void) | null = null;

  /** True when beeps can play now. */
  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must run inside a user tap (Start), or browsers keep audio locked. */
  unlock(): void {
    setAudioSession('playback');
    this.onRunning = null; // set it again after this call
    this.close();
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.6;
    this.gain.connect(ctx.destination);
    ctx.addEventListener('statechange', () => {
      if (this.ctx === ctx && ctx.state === 'running') this.onRunning?.();
    });
    void ctx.resume().catch(() => {});
    // An utterance started inside the tap unlocks speech on iOS.
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }

  private close(): void {
    this.cancel();
    const ctx = this.ctx;
    this.ctx = null;
    this.gain = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }

  /**
   * Schedules all signals after `nowMs` (session time). `signals` holds session times;
   * the Web Audio clock is mapped to session time at this moment.
   */
  schedule(signals: Signal[], nowMs: number): void {
    this.cancel();
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    if (ctx.state !== 'running') {
      // Suspended or interrupted (iOS): the audio clock stands still, so nothing
      // scheduled now would play on time. `onRunning` schedules again.
      void ctx.resume().catch(() => {});
      return;
    }
    const base = ctx.currentTime;
    for (const s of signals) {
      if (s.kind === 'voice' || s.atMs < nowMs) continue;
      const t0 = base + (s.atMs - nowMs) / 1000;
      for (const tone of TONES[s.kind]) this.tone(t0 + tone.at, tone.freq, tone.dur);
    }
  }

  /** Plays a short sample of every signal. */
  test(): void {
    const kinds: SignalKind[] = ['tick', 'tick', 'tick', 'go', 'stop', 'warn', 'done'];
    const play = () => this.schedule(kinds.map((kind, i) => ({ atMs: 300 + i * 1000, kind })), 0);
    this.unlock();
    // A new context starts to run a moment after the tap.
    this.onRunning = () => {
      this.onRunning = null;
      play();
    };
    if (this.ready) this.onRunning();
  }

  private tone(at: number, freq: number, dur: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    // Short attack and release, so the beep does not click.
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.5, at + 0.01);
    env.gain.setValueAtTime(0.5, at + dur - 0.03);
    env.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(env).connect(this.gain!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    osc.onended = () => {
      this.nodes = this.nodes.filter((n) => n !== osc);
    };
    this.nodes.push(osc);
  }

  cancel(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        // already stopped
      }
    }
    this.nodes = [];
  }

  speak(cue: keyof typeof VOICE_TEXT): void {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(VOICE_TEXT[cue]);
    u.lang = 'en-US';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  /** Stops everything after the session. */
  stop(): void {
    this.onRunning = null;
    this.close();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    // Lets other apps' audio (music) take over again.
    setAudioSession('auto');
  }
}

export const player = new Player();

/** Vibration works on Android only, and only while the page is visible. */
export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}
