import { describe, expect, it } from 'vitest';
import { defaultSettings, generatePlan } from '../src/lib/domain/plan';
import type { HangSession } from '../src/lib/domain/types';
import { DocError, parseDoc, toDoc } from '../src/lib/store/doc';

const settings = defaultSettings();
const { plan, sessions } = generatePlan(settings, '2026-10-13', 'p1');
const hang: HangSession = {
  id: 'h1',
  plannedId: 'p1:w1:full',
  type: 'full',
  week: 1,
  datetime: '2026-10-19T17:00:00.000Z',
  durationSec: 845,
  plannedSets: 5,
  sets: [{ edgeMm: 25, targetSec: 5, actualSec: 5, completed: true }],
  rpe: 7,
  painLevel: 1,
  painLocations: ['pulley'],
  sharpPain: false,
  bodyweightKg: 72.5,
  note: 'felt good',
};
const content = { settings, plan, sessions, hangSessions: [hang] };

describe('doc', () => {
  it('round-trips through JSON without loss', () => {
    const doc = toDoc(content, new Date('2026-10-20T00:00:00Z'));
    expect(doc.savedAt).toBe('2026-10-20T00:00:00.000Z');
    expect(parseDoc(JSON.parse(JSON.stringify(doc)))).toEqual(content);
  });

  it('rejects files that are not ours', () => {
    expect(() => parseDoc({ hello: 1 })).toThrow(DocError);
    expect(() => parseDoc(null)).toThrow('not a Hangi Tracker file');
  });

  it('rejects files from a newer version', () => {
    expect(() => parseDoc({ ...toDoc(content), version: 99 })).toThrow('newer version');
  });

  it('rejects broken content', () => {
    expect(() => parseDoc({ ...toDoc(content), plannedSessions: [{}] })).toThrow('planned sessions');
    expect(() => parseDoc({ ...toDoc(content), hangSessions: 'x' })).toThrow('session log');
  });

  it('fills fields an older version did not write', () => {
    const old = { id: 'h0', plannedId: null, datetime: '2026-10-01T10:00:00Z', sets: [{ edgeMm: 30, targetSec: 5, actualSec: 5, completed: true }] };
    const parsed = parseDoc({ ...toDoc(content), hangSessions: [old], settings: undefined });
    expect(parsed.hangSessions[0]).toMatchObject({ id: 'h0', rpe: null, plannedSets: 1, painLocations: [] });
    expect(parsed.settings).toEqual(defaultSettings());
  });
});
