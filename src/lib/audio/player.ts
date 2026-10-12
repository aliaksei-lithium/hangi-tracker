// Sound for the timer.
//
// Beeps are scheduled ahead on the Web Audio clock for the whole rest of the session,
// so they play on time even when the page's JavaScript is throttled (tab in the
// background, screen locked). Any change to the timer (pause, +10 s, skip) cancels
// them and schedules again. A silent looping <audio> element keeps the audio session
// alive on iOS while the screen is locked. This is "as far as the browser allows":
// iOS may still suspend audio in some cases.

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

/** A one-second silent WAV, built in memory (8 kHz, 8-bit mono). */
function silentWavUrl(): string {
  const samples = 8000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128); // 8-bit silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

class Player {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private nodes: OscillatorNode[] = [];
  private keepAlive: HTMLAudioElement | null = null;

  /** Must run inside a user tap (Start), or browsers keep audio locked. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0.6;
      this.gain.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    if (!this.keepAlive) {
      this.keepAlive = new Audio(silentWavUrl());
      this.keepAlive.loop = true;
    }
    void this.keepAlive.play().catch(() => {});
    // An utterance started inside the tap unlocks speech on iOS.
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Hangboard session', artist: 'Hangi Tracker' });
    }
  }

  /**
   * Schedules all signals after `nowMs` (session time). `signals` holds session times;
   * the Web Audio clock is mapped to session time at this moment.
   */
  schedule(signals: Signal[], nowMs: number): void {
    this.cancel();
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const base = ctx.currentTime;
    for (const s of signals) {
      if (s.kind === 'voice' || s.atMs < nowMs) continue;
      const t0 = base + (s.atMs - nowMs) / 1000;
      for (const tone of TONES[s.kind]) this.tone(t0 + tone.at, tone.freq, tone.dur);
    }
  }

  /** Plays a short sample of every signal. */
  test(): void {
    if (!this.ctx) this.unlock();
    const kinds: SignalKind[] = ['tick', 'tick', 'tick', 'go', 'stop', 'warn', 'done'];
    this.schedule(kinds.map((kind, i) => ({ atMs: 300 + i * 1000, kind })), 0);
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
    this.cancel();
    this.keepAlive?.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}

export const player = new Player();

/** Vibration works on Android only, and only while the page is visible. */
export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}
