import { describe, expect, it } from 'vitest';
import { newEntry } from '../src/lib/domain/log';
import { defaultSettings, generatePlan } from '../src/lib/domain/plan';
import { calendar, planVsActual, records, sessionSeries, weekOf, weekTable, weeklyLoad } from '../src/lib/domain/progress';
import { EDGES_MM, type HangSession } from '../src/lib/domain/types';

const settings = defaultSettings();
const { plan, sessions } = generatePlan(settings, '2026-10-13', 'p1'); // starts Mon 19 Oct
const byId = (id: string) => sessions.find((s) => s.id === id)!;

// Noon local time, so the local date is stable in any time zone.
const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();
function entry(date: string, plannedId: string | null, over: Partial<HangSession> = {}): HangSession {
  return { ...newEntry(plannedId ? byId(plannedId) : null, at(date), `e-${date}`), ...over };
}

const w1 = entry('2026-10-19', 'p1:w1:full', { rpe: 7, painLevel: 1, note: 'good' });
const w1l = entry('2026-10-22', 'p1:w1:light');
const w2 = entry('2026-10-26', 'p1:w2:full', {
  sets: [
    { edgeMm: 25, targetSec: 5, actualSec: 5, completed: true },
    { edgeMm: 20, targetSec: 5, actualSec: 3, completed: false },
  ],
});
const log = [w2, w1, w1l];
const planned = sessions.map((s) => (log.some((e) => e.plannedId === s.id) ? { ...s, status: 'done' as const } : s));

describe('weekOf', () => {
  it('uses the stored week or the date', () => {
    expect(weekOf(w1, plan)).toBe(1);
    expect(weekOf({ ...w1, week: null, datetime: at('2026-10-28') }, plan)).toBe(2);
    expect(weekOf({ ...w1, week: null, datetime: at('2026-10-01') }, plan)).toBeNull();
  });
});

describe('weeklyLoad', () => {
  it('sums time under load per week, done and planned', () => {
    const weeks = weeklyLoad(plan, planned, log);
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toEqual({ week: 1, doneSec: 25 + 15, plannedSec: 25 + 15 });
    expect(weeks[1].doneSec).toBe(8);
    expect(weeks[2]).toMatchObject({ doneSec: 0, plannedSec: 30 + 15 });
  });
});

describe('sessionSeries', () => {
  it('gives one point per session, oldest first', () => {
    const s = sessionSeries(log);
    expect(s.map((p) => p.date)).toEqual(['2026-10-19', '2026-10-22', '2026-10-26']);
    expect(s[0]).toMatchObject({ edgeMm: 25, hangSec: 5, rpe: 7, pain: 1 });
    expect(s[2]).toMatchObject({ edgeMm: 20, hangSec: 5 });
  });
});

describe('records', () => {
  it('finds the best completed hang per edge and the biggest session', () => {
    const r = records(log, EDGES_MM);
    expect(r.edges.find((e) => e.edgeMm === 25)).toEqual({ edgeMm: 25, bestSec: 5, date: '2026-10-19' });
    expect(r.edges.find((e) => e.edgeMm === 20)?.bestSec).toBeNull(); // failed hangs do not count
    expect(r.volume).toEqual({ sec: 25, date: '2026-10-19' });
  });
});

describe('calendar', () => {
  it('builds a Monday-first month with marks', () => {
    const days = calendar('2026-10', planned, log, '2026-10-27');
    expect(days).toHaveLength(35); // 1 Oct is a Thursday
    expect(days[0].date).toBe('2026-09-28');
    const mark = (d: string) => days.find((x) => x.date === d)?.mark;
    expect(mark('2026-10-19')).toBe('done');
    expect(mark('2026-10-29')).toBe('planned');
    expect(mark('2026-10-13')).toBeNull();
    expect(days.find((x) => x.date === '2026-10-27')?.today).toBe(true);
  });
  it('marks past open sessions as missed', () => {
    const days = calendar('2026-11', planned, log, '2026-11-10');
    expect(days.find((x) => x.date === '2026-11-02')?.mark).toBe('missed');
  });
});

describe('planVsActual', () => {
  it('lists done, skipped, missed and modified sessions, newest first', () => {
    const p = planned.map((s) => (s.id === 'p1:w2:light' ? { ...s, status: 'skipped' as const } : s.id === 'p1:w4:full' ? { ...s, status: 'modified' as const } : s));
    const rows = planVsActual(p, log, '2026-11-03');
    expect(rows.map((r) => `${r.id}:${r.status}`)).toEqual([
      'p1:w4:full:modified',
      'p1:w3:full:missed',
      'p1:w2:light:skipped',
      'p1:w2:full:done',
      'p1:w1:light:done',
      'p1:w1:full:done',
    ]);
  });
});

describe('weekTable', () => {
  it('fills weeks from the log', () => {
    const rows = weekTable(plan, log);
    expect(rows).toEqual([
      { week: 1, edgeMm: 25, hangSec: 5, setsDone: 8, sessions: 2, notes: 'good' },
      { week: 2, edgeMm: 20, hangSec: 5, setsDone: 1, sessions: 1, notes: '' },
    ]);
  });
});
