import { describe, expect, it } from 'vitest';
import { defaultSettings, sessionDurationSec } from '../src/lib/domain/plan';
import {
  addTime,
  buildSegments,
  canAddTime,
  finish,
  formatClock,
  pause,
  positionAt,
  resume,
  signals,
  skip,
  startTimer,
  totalMs,
  workResults,
} from '../src/lib/domain/timer';
import type { SetSpec } from '../src/lib/domain/types';

const settings = defaultSettings();
const set = (over: Partial<SetSpec> = {}): SetSpec => ({ edgeMm: 25, hangSec: 5, restSec: 150, grip: 'half_crimp', addedKg: 0, ...over });
const twoSets = { warmup: false, sets: [set(), set({ edgeMm: 20 })] };
const T0 = 1_000_000;
const at = (s: number) => T0 + s * 1000;

describe('buildSegments', () => {
  it('builds countdown, hang, rest, prepare, hang', () => {
    const segs = buildSegments(twoSets, settings);
    expect(segs.map((s) => `${s.phase}:${s.durationMs / 1000}`)).toEqual(['countdown:10', 'hang:5', 'rest:145', 'prepare:5', 'hang:5']);
    expect(segs[3].edgeMm).toBe(20); // prepare shows the next set
    expect(segs[3].index).toBe(1);
  });

  it('adds warm-up sets before the work sets', () => {
    const segs = buildSegments({ warmup: true, sets: [set()] }, settings);
    expect(segs.map((s) => s.phase)).toEqual(['countdown', 'warmup', 'rest', 'prepare', 'warmup', 'rest', 'prepare', 'warmup', 'rest', 'prepare', 'hang']);
    expect(segs[1]).toMatchObject({ block: 'warmup', index: 0, of: 3, edgeMm: 30, hangSec: 10 });
  });

  it('matches the duration shown on the preview', () => {
    const session = { warmup: true, sets: [set(), set(), set()] };
    expect(totalMs(buildSegments(session, settings))).toBe(sessionDurationSec(session, settings) * 1000);
  });

  it('uses the whole rest as prepare when the rest is short', () => {
    const segs = buildSegments({ warmup: false, sets: [set({ restSec: 3 }), set()] }, settings);
    expect(segs.map((s) => `${s.phase}:${s.durationMs / 1000}`)).toEqual(['countdown:10', 'hang:5', 'prepare:3', 'hang:5']);
  });

  it('skips the countdown when it is 0', () => {
    const s = { ...settings, timer: { ...settings.timer, countdownSec: 0 } };
    expect(buildSegments(twoSets, s)[0].phase).toBe('hang');
  });
});

describe('position from timestamps', () => {
  const state = startTimer(buildSegments(twoSets, settings), T0);

  it('finds the phase at any time without ticking', () => {
    expect(positionAt(state, at(0))).toMatchObject({ index: 0, remainingMs: 10_000 });
    expect(positionAt(state, at(12)).segment?.phase).toBe('hang');
    expect(positionAt(state, at(12)).remainingMs).toBe(3000);
    expect(positionAt(state, at(100)).segment?.phase).toBe('rest');
    expect(positionAt(state, at(162)).segment?.phase).toBe('prepare');
    expect(positionAt(state, at(166)).segment?.phase).toBe('hang');
    expect(positionAt(state, at(170)).done).toBe(true);
  });

  it('a long gap (locked screen) lands in the right phase', () => {
    expect(positionAt(state, at(163.5))).toMatchObject({ index: 3, remainingMs: 1500 });
  });
});

describe('controls', () => {
  const state = startTimer(buildSegments(twoSets, settings), T0);

  it('pause stops time and resume continues where it was', () => {
    const p = pause(state, at(12));
    expect(positionAt(p, at(60)).remainingMs).toBe(3000);
    const r = resume(p, at(60));
    expect(positionAt(r, at(61)).remainingMs).toBe(2000);
    expect(positionAt(r, at(63)).segment?.phase).toBe('rest');
  });

  it('+10 s extends countdown and rest, not a hang', () => {
    expect(positionAt(addTime(state, at(2)), at(2)).remainingMs).toBe(18_000);
    expect(addTime(state, at(12))).toBe(state);
    expect(canAddTime(positionAt(state, at(12)))).toBe(false);
    const r = addTime(state, at(20));
    expect(positionAt(r, at(20)).remainingMs).toBe(145_000 - 5000 + 10_000);
  });

  it('skip ends the current phase now', () => {
    const s = skip(state, at(3));
    expect(positionAt(s, at(3)).segment?.phase).toBe('hang');
    expect(positionAt(s, at(3)).remainingMs).toBe(5000);
  });

  it('skip during a hang keeps the time held', () => {
    const s = skip(state, at(13));
    expect(workResults(s, at(14))).toEqual([{ index: 0, edgeMm: 25, targetSec: 5, heldSec: 3, reached: false }]);
  });

  it('finish early freezes the timer and keeps the partial hang', () => {
    const f = finish(state, at(167));
    expect(positionAt(f, at(500)).done).toBe(true);
    expect(workResults(f, at(500))).toEqual([
      { index: 0, edgeMm: 25, targetSec: 5, heldSec: 5, reached: true },
      { index: 1, edgeMm: 20, targetSec: 5, heldSec: 2, reached: false },
    ]);
  });

  it('finish while paused does not count the paused time', () => {
    const f = finish(pause(state, at(12)), at(400));
    expect(positionAt(f, at(400)).totalElapsedMs).toBe(12_000);
  });
});

describe('signals', () => {
  const sig = signals(buildSegments(twoSets, settings));
  const times = (kind: string) => sig.filter((s) => s.kind === kind).map((s) => s.atMs / 1000);

  it('ticks 3-2-1 before each hang', () => {
    expect(times('tick')).toEqual([7, 8, 9, 162, 163, 164]);
  });
  it('marks hang start and end', () => {
    expect(times('go')).toEqual([10, 165]);
    expect(times('stop')).toEqual([15, 170]);
  });
  it('warns 10 s and 5 s before a rest ends', () => {
    expect(times('warn')).toEqual([155, 160]);
  });
  it('ends with done', () => {
    expect(sig[sig.length - 1]).toEqual({ atMs: 170_000, kind: 'done' });
  });
});

describe('formatClock', () => {
  it('shows seconds under a minute and m:ss above', () => {
    expect(formatClock(4200)).toBe('5');
    expect(formatClock(134_000)).toBe('2:14');
    expect(formatClock(60_000)).toBe('1:00');
  });
});
