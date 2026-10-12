// Timer engine. Pure functions over an immutable state; no timers inside.
// The session is a list of segments with durations. The position is computed from
// timestamps (`now - startedAt - paused time`), so a hidden tab or a locked screen
// never makes the timer drift: on return the UI simply asks phaseAt(now) again.

import type { Grip, PlannedSession, Settings } from './types';

export type Phase = 'countdown' | 'warmup' | 'hang' | 'rest' | 'prepare';
export type Block = 'warmup' | 'work';

export interface Segment {
  phase: Phase;
  durationMs: number;
  /**
   * The set this segment belongs to: the hang itself, the rest after it, or for
   * countdown and prepare the set that comes next.
   */
  block: Block;
  index: number; // 0-based within the block
  of: number; // sets in the block
  edgeMm: number;
  hangSec: number;
  grip: Grip;
  addedKg: number;
  /** Set on a hang that was cut short by Skip or Finish. */
  actualMs?: number;
}

export interface TimerState {
  segments: Segment[];
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  /** Set when the user finished early. */
  finishedAt: number | null;
}

export interface Position {
  /** Index into segments; equals segments.length when the session is over. */
  index: number;
  segment: Segment | null;
  elapsedMs: number; // inside the segment
  remainingMs: number;
  totalElapsedMs: number;
  done: boolean;
}

const sec = (s: number) => Math.round(s * 1000);

/** Builds the segment list for a session. */
export function buildSegments(session: Pick<PlannedSession, 'warmup' | 'sets'>, settings: Settings): Segment[] {
  const { countdownSec, prepareSec } = settings.timer;
  const w = settings.protocol.warmup;
  const hangs: Omit<Segment, 'phase' | 'durationMs'>[] = [];
  const rests: number[] = []; // rest after each hang in `hangs`, in seconds
  if (session.warmup) {
    for (let i = 0; i < w.sets; i++) {
      hangs.push({ block: 'warmup', index: i, of: w.sets, edgeMm: w.edgeMm, hangSec: w.hangSec, grip: session.sets[0]?.grip ?? 'open_hand', addedKg: 0 });
      rests.push(w.restSec);
    }
  }
  session.sets.forEach((s, i) => {
    hangs.push({ block: 'work', index: i, of: session.sets.length, edgeMm: s.edgeMm, hangSec: s.hangSec, grip: s.grip, addedKg: s.addedKg });
    rests.push(s.restSec);
  });

  const out: Segment[] = [];
  if (hangs.length === 0) return out;
  if (countdownSec > 0) out.push({ ...hangs[0], phase: 'countdown', durationMs: sec(countdownSec) });
  hangs.forEach((h, i) => {
    out.push({ ...h, phase: h.block === 'warmup' ? 'warmup' : 'hang', durationMs: sec(h.hangSec) });
    const next = hangs[i + 1];
    if (!next) return;
    // "Prepare before each set" is taken from the end of the rest.
    const prepare = Math.min(prepareSec, rests[i]);
    const rest = rests[i] - prepare;
    if (rest > 0) out.push({ ...h, phase: 'rest', durationMs: sec(rest) });
    if (prepare > 0) out.push({ ...next, phase: 'prepare', durationMs: sec(prepare) });
  });
  return out;
}

export function startTimer(segments: Segment[], now: number): TimerState {
  return { segments, startedAt: now, pausedAt: null, pausedMs: 0, finishedAt: null };
}

/** Milliseconds of session time that have run (paused time excluded). */
export function elapsedMs(state: TimerState, now: number): number {
  const end = state.finishedAt ?? state.pausedAt ?? now;
  return Math.max(0, end - state.startedAt - state.pausedMs);
}

export function positionAt(state: TimerState, now: number): Position {
  const total = elapsedMs(state, now);
  let start = 0;
  for (let i = 0; i < state.segments.length; i++) {
    const seg = state.segments[i];
    if (total < start + seg.durationMs) {
      const elapsed = total - start;
      return { index: i, segment: seg, elapsedMs: elapsed, remainingMs: seg.durationMs - elapsed, totalElapsedMs: total, done: state.finishedAt !== null };
    }
    start += seg.durationMs;
  }
  return { index: state.segments.length, segment: null, elapsedMs: 0, remainingMs: 0, totalElapsedMs: total, done: true };
}

export function isPaused(state: TimerState): boolean {
  return state.pausedAt !== null;
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.pausedAt !== null || positionAt(state, now).done) return state;
  return { ...state, pausedAt: now };
}

export function resume(state: TimerState, now: number): TimerState {
  if (state.pausedAt === null) return state;
  return { ...state, pausedMs: state.pausedMs + (now - state.pausedAt), pausedAt: null };
}

function replaceSegment(state: TimerState, index: number, seg: Segment): TimerState {
  const segments = state.segments.slice();
  segments[index] = seg;
  return { ...state, segments };
}

/** "+10 s" works during the start countdown, rest and prepare. */
export function canAddTime(pos: Position): boolean {
  return !pos.done && (pos.segment?.phase === 'countdown' || pos.segment?.phase === 'rest' || pos.segment?.phase === 'prepare');
}

export function addTime(state: TimerState, now: number, ms = 10_000): TimerState {
  const pos = positionAt(state, now);
  if (!canAddTime(pos) || !pos.segment) return state;
  return replaceSegment(state, pos.index, { ...pos.segment, durationMs: pos.segment.durationMs + ms });
}

/** Ends the current segment now. A skipped hang keeps how long it was held. */
export function skip(state: TimerState, now: number): TimerState {
  const pos = positionAt(state, now);
  if (pos.done || !pos.segment) return state;
  const seg = pos.segment;
  const held = seg.phase === 'hang' || seg.phase === 'warmup' ? { actualMs: pos.elapsedMs } : {};
  return replaceSegment(state, pos.index, { ...seg, ...held, durationMs: pos.elapsedMs });
}

/** Finish early. A hang in progress counts as held for the time so far. */
export function finish(state: TimerState, now: number): TimerState {
  const pos = positionAt(state, now);
  if (pos.done) return state;
  let next = state;
  if (pos.segment && (pos.segment.phase === 'hang' || pos.segment.phase === 'warmup')) {
    next = replaceSegment(state, pos.index, { ...pos.segment, actualMs: pos.elapsedMs });
  }
  return { ...resume(next, now), finishedAt: now };
}

// ---- results ----

export interface HangResult {
  index: number;
  edgeMm: number;
  targetSec: number;
  /** Seconds held, from the timer. */
  heldSec: number;
  /** True when the hang ran to the end. */
  reached: boolean;
}

/** Work hangs that have started, with the time held. */
export function workResults(state: TimerState, now: number): HangResult[] {
  const pos = positionAt(state, now);
  const out: HangResult[] = [];
  state.segments.forEach((seg, i) => {
    if (seg.phase !== 'hang' || i > pos.index) return;
    let heldMs: number;
    if (seg.actualMs !== undefined) heldMs = seg.actualMs;
    else if (i < pos.index) heldMs = seg.durationMs;
    else heldMs = pos.elapsedMs; // current hang
    if (i === pos.index && heldMs === 0) return; // not started
    const target = sec(seg.hangSec);
    out.push({ index: seg.index, edgeMm: seg.edgeMm, targetSec: seg.hangSec, heldSec: Math.round(heldMs / 1000), reached: heldMs >= target });
  });
  return out;
}

// ---- signals ----

export type SignalKind = 'tick' | 'go' | 'stop' | 'warn' | 'done';
export type VoiceCue = 'get_ready' | 'hang' | 'rest' | 'next_set';

export interface Signal {
  atMs: number; // session time
  kind: SignalKind | 'voice';
  voice?: VoiceCue;
}

/**
 * All signals of the session in session time:
 * 3-2-1 ticks before each hang, a "go" at hang start and a "stop" at hang end,
 * warnings 10 s and 5 s before a rest ends, voice cues at phase starts, "done" at the end.
 */
export function signals(segments: Segment[]): Signal[] {
  const out: Signal[] = [];
  let t = 0;
  let restStart: number | null = null; // start of the rest-and-prepare stretch before the next hang
  for (const seg of segments) {
    const start = t;
    const end = t + seg.durationMs;
    switch (seg.phase) {
      case 'countdown':
        out.push({ atMs: start, kind: 'voice', voice: 'get_ready' });
        break;
      case 'rest':
        restStart = start;
        out.push({ atMs: start, kind: 'voice', voice: 'rest' });
        break;
      case 'prepare':
        restStart ??= start;
        out.push({ atMs: start, kind: 'voice', voice: 'next_set' });
        break;
      case 'warmup':
      case 'hang': {
        for (const before of [3000, 2000, 1000]) if (start - before >= 0 && start > 0) out.push({ atMs: start - before, kind: 'tick' });
        if (restStart !== null) {
          for (const before of [10_000, 5000]) if (start - before >= restStart) out.push({ atMs: start - before, kind: 'warn' });
        }
        restStart = null;
        out.push({ atMs: start, kind: 'go' }, { atMs: start, kind: 'voice', voice: 'hang' }, { atMs: end, kind: 'stop' });
        break;
      }
    }
    t = end;
  }
  if (segments.length) out.push({ atMs: t, kind: 'done' });
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Total length of the session as it stands now (with +10 s and skips). */
export function totalMs(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + s.durationMs, 0);
}

/** "2:14" for rests, "7" for short counts. */
export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return String(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
