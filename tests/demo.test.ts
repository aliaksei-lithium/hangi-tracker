import { describe, expect, it } from 'vitest';
import { demoContent } from '../src/lib/domain/demo';
import { nextSession } from '../src/lib/domain/plan';
import { parseDoc, toDoc } from '../src/lib/store/doc';

describe('demoContent', () => {
  const c = demoContent('2026-10-13'); // Tuesday

  it('starts the plan about four weeks ago and logs every past session', () => {
    expect(c.plan.startDate).toBe('2026-09-21'); // a Monday
    const past = c.sessions.filter((s) => s.date < '2026-10-13');
    expect(past.length).toBe(7);
    expect(past.every((s) => s.status === 'done')).toBe(true);
    expect(c.hangSessions).toHaveLength(7);
    expect(c.hangSessions.every((h) => c.sessions.some((s) => s.id === h.plannedId))).toBe(true);
  });

  it('leaves the next session ready', () => {
    expect(nextSession(c.sessions)?.date).toBe('2026-10-15');
  });

  it('is a valid doc for export and import', () => {
    expect(parseDoc(JSON.parse(JSON.stringify(toDoc(c))))).toEqual(c);
  });
});
