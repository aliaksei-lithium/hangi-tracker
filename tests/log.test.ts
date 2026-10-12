import { describe, expect, it } from 'vitest';
import { newEntry, plannedChangesOnDelete, plannedChangesOnSave, sortLog } from '../src/lib/domain/log';
import { defaultSettings, generatePlan } from '../src/lib/domain/plan';

const settings = defaultSettings();
const { sessions } = generatePlan(settings, '2026-10-13', 'p1');
const w1 = sessions.find((s) => s.id === 'p1:w1:full')!;
const w2 = sessions.find((s) => s.id === 'p1:w2:full')!;

describe('newEntry', () => {
  it('copies the planned sets as completed', () => {
    const e = newEntry(w1, '2026-10-19T17:00:00Z', 'e1');
    expect(e).toMatchObject({ plannedId: w1.id, type: 'full', week: 1, plannedSets: 5 });
    expect(e.sets[0]).toEqual({ edgeMm: 25, targetSec: 5, actualSec: 5, completed: true });
  });
  it('has one default set without a plan', () => {
    expect(newEntry(null, '2026-10-19T17:00:00Z', 'e1')).toMatchObject({ plannedId: null, type: null, plannedSets: 1 });
  });
});

describe('plan links', () => {
  it('marks the linked session done on save', () => {
    const e = newEntry(w1, '2026-10-19T17:00:00Z', 'e1');
    expect(plannedChangesOnSave(e, undefined, sessions, settings)).toEqual([{ ...w1, status: 'done' }]);
  });

  it('reopens the old link when the entry moves to another session', () => {
    const before = newEntry(w1, '2026-10-19T17:00:00Z', 'e1');
    const after = { ...before, plannedId: w2.id };
    const planned = sessions.map((s) => (s.id === w1.id ? { ...s, status: 'done' as const } : s));
    const out = plannedChangesOnSave(after, before, planned, settings);
    expect(out.map((p) => `${p.id}:${p.status}`)).toEqual(['p1:w1:full:planned', 'p1:w2:full:done']);
  });

  it('reopens a modified session as modified', () => {
    const modified = { ...w1, status: 'done' as const, sets: w1.sets.slice(0, 3) };
    const e = newEntry(modified, '2026-10-19T17:00:00Z', 'e1');
    expect(plannedChangesOnDelete(e, [modified], settings)[0].status).toBe('modified');
  });

  it('changes nothing for entries outside the plan', () => {
    const e = newEntry(null, '2026-10-19T17:00:00Z', 'e1');
    expect(plannedChangesOnSave(e, undefined, sessions, settings)).toEqual([]);
    expect(plannedChangesOnDelete(e, sessions, settings)).toEqual([]);
  });
});

it('sorts the log newest first', () => {
  const a = newEntry(null, '2026-10-01T10:00:00Z', 'a');
  const b = newEntry(null, '2026-10-05T10:00:00Z', 'b');
  expect(sortLog([a, b]).map((s) => s.id)).toEqual(['b', 'a']);
});
