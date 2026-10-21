import { describe, expect, it } from 'vitest';
import { blockSets, currentBlock, generateBlock, planNextBlock } from '../src/lib/domain/block';
import { newEntry } from '../src/lib/domain/log';
import { defaultSettings, generatePlan, nextSession, resetToPlan } from '../src/lib/domain/plan';
import { weekOf, weeklyLoad } from '../src/lib/domain/progress';
import { applySchedule } from '../src/lib/domain/suggest';
import type { BlockConfig, HangSession } from '../src/lib/domain/types';

const settings = defaultSettings();
const { plan, sessions } = generatePlan(settings, '2026-10-13', 'p1');
const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();

const block: BlockConfig = {
  fullEdgeMm: 25,
  startHangSec: 6,
  startSets: 5,
  lightEdgeMm: 30,
  weeks: 8,
  easyWeek: false,
  fullRestSec: 120,
  lightRestSec: 120,
  grip: 'half_crimp',
  warmup: true,
};
const shape = (sets: { edgeMm: number; hangSec: number }[]) => `${sets[0].edgeMm}mm ${sets.length}x${sets[0].hangSec}s`;

describe('blockSets', () => {
  it('builds up sets first, then hang time, over the block', () => {
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => shape(blockSets(block, 'full', w)));
    expect(weeks).toEqual(['25mm 5x6s', '25mm 5x6s', '25mm 5x7s', '25mm 6x7s', '25mm 6x7s', '25mm 6x8s', '25mm 7x8s', '25mm 7x8s']);
    expect(blockSets(block, 'full', 1)[0].restSec).toBe(120);
  });

  it('follows the first weeks in a short block and stretches a long one', () => {
    const short = { ...block, weeks: 4 };
    expect([1, 2, 3, 4].map((w) => shape(blockSets(short, 'full', w)))).toEqual(['25mm 5x6s', '25mm 5x6s', '25mm 5x7s', '25mm 6x7s']);
    const long = { ...block, weeks: 12 };
    expect(shape(blockSets(long, 'full', 12))).toBe('25mm 7x8s');
    expect(shape(blockSets(long, 'full', 6))).toBe('25mm 6x7s');
  });

  it('has light sessions and an easy week on the light edge', () => {
    expect(shape(blockSets(block, 'light', 1))).toBe('30mm 3x5s');
    expect(shape(blockSets(block, 'light', 6))).toBe('30mm 4x5s');
    expect(shape(blockSets(block, 'full', 0))).toBe('30mm 3x5s');
  });
});

describe('generateBlock', () => {
  it('starts on the next training day, with an easy week first when asked', () => {
    const g = generateBlock(settings, { ...block, easyWeek: true }, 'b2', '2026-12-08', 2);
    expect(g.plan).toMatchObject({ id: 'b2', startDate: '2026-12-21', weeks: 8, number: 2 });
    const easy = g.sessions.filter((s) => s.week === 0);
    expect(easy.map((s) => s.date)).toEqual(['2026-12-14', '2026-12-17']);
    expect(g.sessions.filter((s) => s.week >= 1)).toHaveLength(16);
    // Reset to plan returns to the block values, not the protocol.
    const w3 = g.sessions.find((s) => s.id === 'b2:w3:full')!;
    expect(shape(resetToPlan({ ...w3, sets: [] }, settings).sets)).toBe('25mm 5x7s');
  });

  it('keeps block values when the schedule changes', () => {
    const g = generateBlock(settings, block, 'b2', '2026-12-08', 2);
    const mwf = { ...settings, schedule: { ...settings.schedule, days: [{ day: 1, type: 'full' as const }, { day: 3, type: 'light' as const }, { day: 5, type: 'full' as const }] } };
    const out = applySchedule(g.sessions, mwf, g.plan, '2026-12-08', ':s1').sessions;
    expect(shape(out.find((s) => s.week === 3 && s.type === 'full')!.sets)).toBe('25mm 5x7s');
  });
});

describe('planNextBlock', () => {
  function full(date: string, id: string, n: number, hang: number, over: Partial<HangSession> = {}): HangSession {
    const sets = Array.from({ length: n }, () => ({ edgeMm: 25, targetSec: hang, actualSec: hang, completed: true }));
    return { ...newEntry(sessions.find((s) => s.id === id)!, at(date), `e-${id}`), sets, plannedSets: n, ...over };
  }

  it('derives the start values of the first plan', () => {
    expect(currentBlock(plan, sessions, settings)).toMatchObject({ fullEdgeMm: 25, startHangSec: 5, startSets: 5, lightEdgeMm: 30, weeks: 8 });
  });

  it('recommends a smaller edge after 7 s on 6 sets', () => {
    const log = [full('2026-11-23', 'p1:w6:full', 6, 7), full('2026-11-30', 'p1:w7:full', 7, 7)];
    const p = planNextBlock(plan, sessions, log, settings);
    expect(p.recommended).toBe('smaller');
    expect(p.options.smaller).toMatchObject({ fullEdgeMm: 20, startHangSec: 5, startSets: 5 });
    expect(p.options.continue).toMatchObject({ fullEdgeMm: 25, startHangSec: 7 });
    expect(p.options.repeat).toMatchObject({ fullEdgeMm: 25, startHangSec: 5 });
  });

  it('recommends continue otherwise, and an easy week after a real block', () => {
    const ids = ['p1:w1:full', 'p1:w2:full', 'p1:w3:full', 'p1:w4:full', 'p1:w5:full', 'p1:w6:full'];
    const log = ids.map((id, i) => full(`2026-10-${19 + i * 7 > 31 ? '31' : 19 + i * 7}`, id, 5, 6));
    const planned = sessions.map((s) => (ids.includes(s.id) ? { ...s, status: 'done' as const } : s));
    const p = planNextBlock(plan, planned, log, settings);
    expect(p.recommended).toBe('continue');
    expect(p.easyWeek).toBe(true);
    expect(p.done).toBe(6);
  });

  it('recommends repeat when nothing was done yet', () => {
    expect(planNextBlock(plan, sessions, [], settings).recommended).toBe('repeat');
  });
});

describe('old blocks in progress views', () => {
  it('counts only sessions of the current block per week', () => {
    const old = newEntry(sessions.find((s) => s.id === 'p1:w2:full')!, at('2026-10-26'), 'old');
    const g = generateBlock(settings, block, 'b2', '2026-12-08', 2);
    expect(weekOf(old, g.plan)).toBeNull();
    const load = weeklyLoad(g.plan, [...sessions, ...g.sessions], [old]);
    expect(load[1].doneSec).toBe(0);
    expect(load[0].plannedSec).toBe(5 * 6 + 3 * 5);
    expect(nextSession(g.sessions)?.id).toBe('b2:w1:full');
  });
});
