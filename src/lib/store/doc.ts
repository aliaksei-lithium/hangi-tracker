// One JSON format for the server snapshot, export and import, so one serializer
// serves all three (acceptance criterion 8: export and import restore all data).

import { withDefaults } from '../domain/plan';
import type { HangSession, Plan, PlannedSession, Settings } from '../domain/types';

export const DOC_FORMAT = 'hangi-tracker';
export const DOC_VERSION = 1;

export interface Doc {
  format: typeof DOC_FORMAT;
  version: number;
  savedAt: string;
  settings: Settings;
  plan: Plan;
  plannedSessions: PlannedSession[];
  hangSessions: HangSession[];
}

export interface DocContent {
  settings: Settings;
  plan: Plan;
  sessions: PlannedSession[];
  hangSessions: HangSession[];
}

export function toDoc(c: DocContent, now: Date = new Date()): Doc {
  return {
    format: DOC_FORMAT,
    version: DOC_VERSION,
    savedAt: now.toISOString(),
    settings: c.settings,
    plan: c.plan,
    plannedSessions: c.sessions,
    hangSessions: c.hangSessions,
  };
}

export class DocError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks a doc from a file or the server and fills defaults for fields that an
 * older version did not write. Throws DocError with a message for the user.
 */
export function parseDoc(input: unknown): DocContent {
  if (!isObject(input) || input.format !== DOC_FORMAT) throw new DocError('This is not a Hangi Tracker file.');
  if (typeof input.version !== 'number' || input.version > DOC_VERSION) {
    throw new DocError('This file comes from a newer version of the app. Update the app first.');
  }
  const { plan, plannedSessions, hangSessions } = input;
  if (!isObject(plan) || typeof plan.id !== 'string' || typeof plan.startDate !== 'string') throw new DocError('The file has no valid plan.');
  if (!Array.isArray(plannedSessions) || !plannedSessions.every((s) => isObject(s) && typeof s.id === 'string' && Array.isArray(s.sets))) {
    throw new DocError('The file has invalid planned sessions.');
  }
  if (!Array.isArray(hangSessions) || !hangSessions.every((s) => isObject(s) && typeof s.id === 'string' && Array.isArray(s.sets))) {
    throw new DocError('The file has an invalid session log.');
  }
  return {
    settings: withDefaults(isObject(input.settings) ? (input.settings as Partial<Settings>) : undefined),
    plan: plan as unknown as Plan,
    sessions: plannedSessions as PlannedSession[],
    hangSessions: (hangSessions as HangSession[]).map(withSessionDefaults),
  };
}

/** Fields added after the first version get neutral values. */
export function withSessionDefaults(s: Partial<HangSession> & Pick<HangSession, 'id' | 'datetime' | 'sets'>): HangSession {
  return {
    plannedId: null,
    type: null,
    week: null,
    durationSec: 0,
    plannedSets: s.sets.length,
    rpe: null,
    painLevel: null,
    painLocations: [],
    sharpPain: false,
    bodyweightKg: null,
    note: '',
    ...s,
  };
}
