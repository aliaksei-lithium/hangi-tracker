// Session log rules: manual entries, edits and deletes, and how they mark the plan.

import { baseSetsOf } from './plan';
import type { HangSession, PlannedSession, Settings } from './types';

/** A manual entry prefilled from a planned session (or empty sets when there is none). */
export function newEntry(planned: PlannedSession | null, datetime: string, id: string): HangSession {
  const sets = planned
    ? planned.sets.map((s) => ({ edgeMm: s.edgeMm, targetSec: s.hangSec, actualSec: s.hangSec, completed: true }))
    : [{ edgeMm: 25, targetSec: 5, actualSec: 5, completed: true }];
  return {
    id,
    plannedId: planned?.id ?? null,
    type: planned?.type ?? null,
    week: planned?.week ?? null,
    datetime,
    durationSec: 0,
    plannedSets: sets.length,
    sets,
    rpe: null,
    painLevel: null,
    painLocations: [],
    sharpPain: false,
    bodyweightKg: null,
    note: '',
  };
}

/** Status of a planned session that no longer has a log entry. */
export function reopened(p: PlannedSession, settings: Settings): PlannedSession {
  const asPlanned = JSON.stringify(p.sets) === JSON.stringify(baseSetsOf(p, settings));
  return { ...p, status: asPlanned ? 'planned' : 'modified' };
}

/**
 * Planned sessions to update when an entry is saved: the linked one becomes done,
 * and one that was linked before (but no longer) opens again.
 */
export function plannedChangesOnSave(
  entry: HangSession,
  previous: HangSession | undefined,
  planned: PlannedSession[],
  settings: Settings,
): PlannedSession[] {
  const out: PlannedSession[] = [];
  const byId = (id: string | null) => (id ? planned.find((p) => p.id === id) : undefined);
  const oldLink = byId(previous?.plannedId ?? null);
  const newLink = byId(entry.plannedId);
  if (oldLink && oldLink.id !== newLink?.id) out.push(reopened(oldLink, settings));
  if (newLink && newLink.status !== 'done') out.push({ ...newLink, status: 'done' });
  return out;
}

/** Planned sessions to update when an entry is deleted. */
export function plannedChangesOnDelete(entry: HangSession, planned: PlannedSession[], settings: Settings): PlannedSession[] {
  const link = planned.find((p) => p.id === entry.plannedId);
  return link ? [reopened(link, settings)] : [];
}

/** Newest first. */
export function sortLog(log: HangSession[]): HangSession[] {
  return [...log].sort((a, b) => b.datetime.localeCompare(a.datetime));
}
