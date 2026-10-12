import { describe, expect, it } from 'vitest';
import { newEntry } from '../src/lib/domain/log';
import { defaultSettings, generatePlan, nextSession, resetToPlan } from '../src/lib/domain/plan';
import { findSuggestions, moveToEdge, redate, restartAfterBreak, skipNext, stepBack } from '../src/lib/domain/suggest';
import type { HangSession, PlannedSession } from '../src/lib/domain/types';

const settings = defaultSettings();
const { plan, sessions } = generatePlan(settings, '2026-10-13', 'p1'); // week 1 starts Mon 19 Oct
const byId = (list: PlannedSession[], id: string) => list.find((s) => s.id === id)!;
const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();

/** A full session on `edge`: `n` sets of `hang` s, all completed. */
function full(date: string, plannedId: string, edge: number, n: number, hang: number, over: Partial<HangSession> = {}): HangSession {
  const sets = Array.from({ length: n }, () => ({ edgeMm: edge, targetSec: hang, actualSec: hang, completed: true }));
  return { ...newEntry(byId(sessions, plannedId), at(date), `e-${date}`), sets, plannedSets: n, ...over };
}
const done = (list: PlannedSession[], log: HangSession[]) => list.map((s) => (log.some((e) => e.plannedId === s.id) ? { ...s, status: 'done' as const } : s));

describe('smaller edge', () => {
  const log = [full('2026-11-23', 'p1:w6:full', 25, 6, 7), full('2026-11-30', 'p1:w7:full', 25, 7, 7)];
  const planned = done(sessions, log);

  it('is suggested after 7 s × 6-7 sets on the edge in two weeks in a row', () => {
    const s = findSuggestions(plan, planned, log, settings, '2026-12-01');
    expect(s.map((x) => x.kind)).toEqual(['edge']);
    expect(s[0].edgeMm).toBe(20);
  });

  it('is not suggested with only one strong week', () => {
    expect(findSuggestions(plan, planned, [log[1]], settings, '2026-12-01')).toEqual([]);
  });

  it('is not suggested when the weeks are not consecutive', () => {
    const gap = [full('2026-11-16', 'p1:w5:full', 25, 6, 7), log[1]];
    expect(findSuggestions(plan, done(sessions, gap), gap, settings, '2026-12-01').some((x) => x.kind === 'edge')).toBe(false);
  });

  it('is not suggested when a set failed or pain was at the threshold', () => {
    const failed = [log[0], { ...log[1], sets: log[1].sets.map((x, i) => (i === 6 ? { ...x, completed: false, actualSec: 4 } : x)) }];
    expect(findSuggestions(plan, planned, failed, settings, '2026-12-01')).toEqual([]);
    const painful = [log[0], { ...log[1], painLevel: 3 }];
    expect(findSuggestions(plan, planned, painful, settings, '2026-12-01').some((x) => x.kind === 'edge')).toBe(false);
  });

  it('does not come back once handled', () => {
    const key = findSuggestions(plan, planned, log, settings, '2026-12-01')[0].key;
    expect(findSuggestions({ ...plan, handled: [key] }, planned, log, settings, '2026-12-01')).toEqual([]);
  });

  it('on accept restarts open full sessions on the new edge with 5 s × 5', () => {
    const throughWeek7 = sessions.map((s) => (s.week <= 7 ? { ...s, status: 'done' as const } : s));
    const moved = moveToEdge(throughWeek7, settings, 20);
    const w8 = byId(moved, 'p1:w8:full');
    expect(w8.sets.length).toBe(5);
    expect(w8.sets.every((x) => x.edgeMm === 20 && x.hangSec === 5)).toBe(true);
    expect(byId(moved, 'p1:w8:light').sets[0].edgeMm).toBe(30); // light stays
    expect(byId(moved, 'p1:w7:full').status).toBe('done'); // done stays
    // Reset to plan keeps the accepted change.
    expect(resetToPlan({ ...w8, sets: [] }, settings).sets).toEqual(w8.sets);
  });
});

describe('pain', () => {
  it('suggests a step back when pain is above the threshold', () => {
    const log = [full('2026-10-19', 'p1:w1:full', 25, 5, 5, { painLevel: 4 })];
    const s = findSuggestions(plan, done(sessions, log), log, settings, '2026-10-20');
    expect(s.map((x) => x.kind)).toEqual(['pain']);
    expect(s[0].text).toContain('Pain was 4 of 10');
  });

  it('suggests a step back after a click or pop', () => {
    const log = [full('2026-10-19', 'p1:w1:full', 25, 5, 5, { painLevel: 1, sharpPain: true })];
    expect(findSuggestions(plan, done(sessions, log), log, settings, '2026-10-20')[0].text).toContain('click or a pop');
  });

  it('is quiet at the threshold and when suggestions are off', () => {
    const log = [full('2026-10-19', 'p1:w1:full', 25, 5, 5, { painLevel: 3 })];
    expect(findSuggestions(plan, done(sessions, log), log, settings, '2026-10-20')).toEqual([]);
    const off = { ...settings, rules: { ...settings.rules, suggestions: false } };
    expect(findSuggestions(plan, sessions, [{ ...log[0], painLevel: 9 }], off, '2026-10-20')).toEqual([]);
  });
});

describe('break', () => {
  const log = [full('2026-10-19', 'p1:w1:full', 25, 5, 5)];
  it('suggests going back after more than 10 days', () => {
    expect(findSuggestions(plan, done(sessions, log), log, settings, '2026-10-30').map((x) => x.kind)).toEqual(['break']);
    expect(findSuggestions(plan, done(sessions, log), log, settings, '2026-10-29')).toEqual([]);
  });
  it('can be turned off', () => {
    const off = { ...settings, rules: { ...settings.rules, breakDays: 0 } };
    expect(findSuggestions(plan, done(sessions, log), log, off, '2026-11-30')).toEqual([]);
  });
});

describe('plan changes', () => {
  let n = 0;
  const newId = (type: string) => `new-${type}-${++n}`;

  it('stepBack repeats the previous week and adds a week at the end', () => {
    const log = [full('2026-10-26', 'p1:w2:full', 25, 5, 5)];
    const planned = done(sessions, [...log, full('2026-10-19', 'p1:w1:full', 25, 5, 5)]).map((s) => (s.id === 'p1:w1:light' || s.id === 'p1:w2:light' ? { ...s, status: 'done' as const } : s));
    const out = stepBack(planned, settings, newId);
    expect(out).toHaveLength(18);
    // Week 3 full now repeats week 2 (5 × 5 s) instead of 5 × 6 s.
    const w3 = byId(out, 'p1:w3:full');
    expect(w3).toMatchObject({ week: 2, status: 'planned' });
    expect(w3.sets[0].hangSec).toBe(5);
    // The added full session continues with week 8 one week after the old end.
    const added = out.filter((s) => s.id.startsWith('new-'));
    expect(added.map((s) => [s.type, s.week, s.date])).toEqual([
      ['full', 8, '2026-12-14'],
      ['light', 8, '2026-12-17'],
    ]);
    expect(added[0].sets[0].edgeMm).toBe(20);
  });

  it('skipNext skips only the next open session', () => {
    const out = skipNext(sessions);
    expect(byId(out, 'p1:w1:full').status).toBe('skipped');
    expect(nextSession(out)?.id).toBe('p1:w1:light');
  });

  it('redate moves open sessions to the schedule days from today', () => {
    const out = redate(sessions, settings, '2026-11-04'); // a Wednesday
    expect(byId(out, 'p1:w1:full').date).toBe('2026-11-09'); // Monday
    expect(byId(out, 'p1:w1:light').date).toBe('2026-11-12'); // Thursday
    expect(byId(out, 'p1:w2:full').date).toBe('2026-11-16');
  });

  it('restartAfterBreak steps back and continues from today', () => {
    const log = [full('2026-10-26', 'p1:w2:full', 25, 5, 5)];
    const planned = done(sessions, log);
    const out = restartAfterBreak(planned, settings, '2026-11-18', newId);
    const next = nextSession(out)!;
    expect(next.date >= '2026-11-18').toBe(true);
    expect(byId(out, 'p1:w3:full')).toMatchObject({ week: 2 });
  });
});
