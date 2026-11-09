// Sound for the timer.
//
// Beeps and voice prompts are scheduled ahead on the Web Audio clock for the whole rest of the session,
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

import type { Signal, SignalKind, VoiceCue } from '../domain/timer';
import getReadyUrl from './voice/get_ready.wav';
import hangUrl from './voice/hang.wav';
import nextSetUrl from './voice/next_set.wav';
import restUrl from './voice/rest.wav';

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

// Recorded prompts, played through Web Audio like the beeps. Speech synthesis is not
// used: on iOS it interrupts the AudioContext (the beeps stop) and is often silent in
// an installed app.
const VOICE_URL: Record<VoiceCue, string> = {
  get_ready: getReadyUrl,
  hang: hangUrl,
  rest: restUrl,
  next_set: nextSetUrl,
};

let voices: Partial<Record<VoiceCue, AudioBuffer>> = {};
let voicesLoading: Promise<void> | null = null;
let voicesLoaded = false;

/** Loads the prompts once. Never rejects: without them the beeps still play. */
function loadVoices(ctx: AudioContext): Promise<void> {
  voicesLoading ??= Promise.all(
    (Object.keys(VOICE_URL) as VoiceCue[]).map(async (cue) => {
      const data = await (await fetch(VOICE_URL[cue])).arrayBuffer();
      voices[cue] = await ctx.decodeAudioData(data);
    }),
  ).then(
    () => {
      voicesLoaded = true;
    },
    () => {
      voices = {};
      voicesLoading = null; // try again on the next unlock
    },
  );
  return voicesLoading;
}

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
  private nodes: AudioScheduledSourceNode[] = [];

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
    // Prompts that finish loading after the first schedule are added by a new one.
    const loaded = voicesLoaded;
    void loadVoices(ctx).then(() => {
      if (!loaded && this.ctx === ctx && ctx.state === 'running') this.onRunning?.();
    });
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
  schedule(signals: Signal[], nowMs: number, on = { beeps: true, voice: true }): void {
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
      if (s.atMs < nowMs) continue;
      const t0 = base + (s.atMs - nowMs) / 1000;
      if (s.kind === 'voice') {
        const buffer = s.voice && voices[s.voice];
        if (on.voice && buffer) this.clip(t0, buffer);
      } else if (on.beeps) {
        for (const tone of TONES[s.kind]) this.tone(t0 + tone.at, tone.freq, tone.dur);
      }
    }
  }

  /** Plays a short sample of every signal, with one voice prompt when `voice` is on. */
  test(voice = false): void {
    const sample: Signal[] = [{ atMs: 300, kind: 'voice', voice: 'get_ready' }];
    const kinds: SignalKind[] = ['tick', 'tick', 'tick', 'go', 'stop', 'warn', 'done'];
    kinds.forEach((kind, i) => sample.push({ atMs: 1500 + i * 1000, kind }));
    this.unlock();
    // A new context starts to run a moment after the tap.
    this.onRunning = () => {
      this.onRunning = null;
      void loadVoices(this.ctx!).then(() => this.schedule(sample, 0, { beeps: true, voice }));
    };
    if (this.ready) this.onRunning();
  }

  private clip(at: number, buffer: AudioBuffer): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx!.destination);
    src.start(at);
    src.onended = () => {
      this.nodes = this.nodes.filter((n) => n !== src);
    };
    this.nodes.push(src);
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

  /** Stops everything after the session. */
  stop(): void {
    this.onRunning = null;
    this.close();
    // Lets other apps' audio (music) take over again.
    setAudioSession('auto');
  }
}

export const player = new Player();

/** Vibration works on Android only, and only while the page is visible. */
export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}
