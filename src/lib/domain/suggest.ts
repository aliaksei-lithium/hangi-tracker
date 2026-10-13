// Progression suggestions ("Progression suggestions and safety" in the requirements).
// The app suggests, it never forces: every suggestion has Accept and Dismiss, and the
// plan only changes after Accept. Nothing here is medical advice.

import { addDays, daysBetween, toIsoDate } from './dates';
import { baseSetsOf, nextWeekday, sortSessions, stepForWeek } from './plan';
import { weekOf } from './progress';
import { EDGES_MM, type HangSession, type Plan, type PlannedSession, type SetSpec, type Settings } from './types';

export type SuggestionKind = 'edge' | 'pain' | 'break';

export interface Suggestion {
  /** Stable id; once handled it does not come back. */
  key: string;
  kind: SuggestionKind;
  title: string;
  text: string;
  /** For 'edge': the new edge. */
  edgeMm?: number;
}

const isOpen = (s: PlannedSession) => s.status === 'planned' || s.status === 'modified';
const localDate = (iso: string) => toIsoDate(new Date(iso));
const latest = (log: HangSession[]) => [...log].sort((a, b) => b.datetime.localeCompare(a.datetime))[0];

/** True when a full session met the bar for a smaller edge: 7 s × 6-7 sets, all done, low pain. */
function strongSession(s: HangSession, edgeMm: number, threshold: number): boolean {
  return (
    s.sets.length >= 6 &&
    s.sets.every((x) => x.completed && x.edgeMm === edgeMm && x.actualSec >= 7) &&
    (s.painLevel ?? 0) < threshold &&
    !s.sharpPain
  );
}

export function findSuggestions(plan: Plan, sessions: PlannedSession[], log: HangSession[], settings: Settings, today: string): Suggestion[] {
  if (!settings.rules.suggestions || log.length === 0) return [];
  const handled = new Set(plan.handled ?? []);
  const out: Suggestion[] = [];
  const last = latest(log);
  const { painThreshold, breakDays } = settings.rules;
  const hasOpen = sessions.some(isOpen);

  // Step back after pain above the threshold, or a click or pop.
  const pain = last.painLevel ?? 0;
  if (hasOpen && (last.sharpPain || pain > painThreshold)) {
    out.push({
      key: `pain:${last.id}`,
      kind: 'pain',
      title: 'Take a step back',
      text: last.sharpPain
        ? 'You reported sharp pain, a click or a pop. Skip the next session, or repeat last week when you train again. If it does not go away, see a doctor.'
        : `Pain was ${pain} of 10 in the last session, above your limit of ${painThreshold}. Repeat last week, or skip the next session.`,
    });
  }

  // Missed weeks: after a long break, go back one week and continue from today.
  const gap = daysBetween(localDate(last.datetime), today);
  if (hasOpen && breakDays > 0 && gap > breakDays) {
    out.push({
      key: `break:${last.id}`,
      kind: 'break',
      title: 'Back after a break',
      text: `Your last session was ${gap} days ago. Go back one week in the plan and continue from today.`,
    });
  }

  // Smaller edge: the bar met in full sessions of two plan weeks in a row.
  const nextFull = sortSessions(sessions).find((s) => s.type === 'full' && isOpen(s));
  const edge = nextFull?.sets[0]?.edgeMm;
  const smaller = edge === undefined ? undefined : [...EDGES_MM].reverse().find((e) => e < edge);
  if (nextFull && edge !== undefined && smaller !== undefined && !out.some((s) => s.kind === 'pain')) {
    const byWeek = new Map<number, HangSession[]>();
    for (const s of log) {
      const w = weekOf(s, plan);
      if (s.type === 'full' && w !== null) byWeek.set(w, [...(byWeek.get(w) ?? []), s]);
    }
    const weeks = [...byWeek.keys()].sort((a, b) => b - a);
    const [w2, w1] = weeks;
    const strongWeek = (w: number) => byWeek.get(w)!.some((s) => strongSession(s, edge, painThreshold));
    if (w1 !== undefined && w2 === w1 + 1 && strongWeek(w1) && strongWeek(w2)) {
      out.push({
        key: `edge:${edge}:${last.id}`,
        kind: 'edge',
        edgeMm: smaller,
        title: `Move to ${smaller} mm`,
        text: `You held 7 s on ${edge} mm for 6 or more sets in two weeks in a row, with low pain. Next full sessions start on ${smaller} mm with 5 s × 5 sets and build up again.`,
      });
    }
  }

  return out.filter((s) => !handled.has(s.key));
}

// ---- plan changes after Accept ----

function withBase(s: PlannedSession, sets: SetSpec[], week = s.week): PlannedSession {
  return { ...s, week, sets: sets.map((x) => ({ ...x })), baseSets: sets.map((x) => ({ ...x })), status: 'planned' };
}

/** Open full sessions restart the progression on a smaller edge (first session 5 s × 5). */
export function moveToEdge(sessions: PlannedSession[], settings: Settings, edgeMm: number): PlannedSession[] {
  const fulls = sortSessions(sessions).filter((s) => s.type === 'full' && isOpen(s));
  const changed = new Map(
    fulls.map((s, k) => {
      const step = stepForWeek(settings.protocol.full.steps, k + 1);
      const sets = Array.from({ length: step.sets }, () => ({
        edgeMm,
        hangSec: step.hangSec,
        restSec: settings.protocol.full.restSec,
        grip: settings.protocol.grip,
        addedKg: 0,
      }));
      return [s.id, withBase(s, sets)];
    }),
  );
  return sessions.map((s) => changed.get(s.id) ?? s);
}

/**
 * Repeat the previous week: every open session takes the plan of the session of the
 * same type one week earlier, and one week is added at the end so nothing is lost.
 * `newId` makes ids for the added sessions.
 */
export function stepBack(sessions: PlannedSession[], settings: Settings, newId: (type: string) => string): PlannedSession[] {
  const out = new Map(sessions.map((s) => [s.id, s]));
  const added: PlannedSession[] = [];
  for (const type of ['full', 'light'] as const) {
    const list = sortSessions(sessions).filter((s) => s.type === type);
    const firstOpen = list.findIndex(isOpen);
    if (firstOpen < 0) continue;
    const bases = list.map((s) => ({ week: s.week, sets: baseSetsOf(s, settings) }));
    for (let i = firstOpen; i < list.length; i++) {
      if (!isOpen(list[i])) continue;
      const prev = bases[Math.max(0, i - 1)];
      out.set(list[i].id, withBase(list[i], prev.sets, prev.week));
    }
    const last = list[list.length - 1];
    const lastBase = bases[bases.length - 1];
    added.push(withBase({ ...last, id: newId(type), date: addDays(last.date, 7) }, lastBase.sets, lastBase.week));
  }
  return [...sessions.map((s) => out.get(s.id)!), ...added];
}

/** Skip the next open session. */
export function skipNext(sessions: PlannedSession[]): PlannedSession[] {
  const next = sortSessions(sessions).find(isOpen);
  return sessions.map((s) => (s.id === next?.id ? { ...s, status: 'skipped' } : s));
}

/** Gives open sessions new dates from today on, on the schedule days, in plan order. */
export function redate(sessions: PlannedSession[], settings: Settings, today: string): PlannedSession[] {
  const open = sortSessions(sessions).filter(isOpen);
  const dates = new Map<string, string>();
  let cursor = today;
  for (const s of open) {
    const day = s.type === 'full' ? settings.schedule.fullDay : settings.schedule.lightDay;
    const date = nextWeekday(cursor, day);
    dates.set(s.id, date);
    cursor = addDays(date, 1);
  }
  return sessions.map((s) => (dates.has(s.id) ? { ...s, date: dates.get(s.id)! } : s));
}

/** After a long break: go back one week and continue from today. */
export function restartAfterBreak(sessions: PlannedSession[], settings: Settings, today: string, newId: (type: string) => string): PlannedSession[] {
  return redate(stepBack(sessions, settings, newId), settings, today);
}


// ---- user changes to dates and extra sessions ----

/**
 * Moves one open session to a new date. With `shiftNext`, the open sessions after it
 * move by the same number of days, so the gaps between sessions stay the same.
 */
export function moveSession(sessions: PlannedSession[], id: string, newDate: string, shiftNext: boolean): PlannedSession[] {
  const target = sessions.find((s) => s.id === id);
  if (!target) return sessions;
  const delta = daysBetween(target.date, newDate);
  if (delta === 0) return sessions;
  return sessions.map((s) => {
    if (s.id === id) return { ...s, date: newDate };
    if (shiftNext && isOpen(s) && (s.date > target.date || (s.date === target.date && s.week > target.week))) {
      return { ...s, date: addDays(s.date, delta) };
    }
    return s;
  });
}

/**
 * A one-off session outside the plan. It takes the values of the next open session of
 * that type, so it fits where you are in the plan. It is never stored in the plan.
 */
export function extraSession(sessions: PlannedSession[], settings: Settings, type: 'full' | 'light', today: string): PlannedSession {
  const next = sortSessions(sessions).find((s) => s.type === type && isOpen(s));
  const source = next ?? [...sortSessions(sessions)].reverse().find((s) => s.type === type);
  const sets = source ? baseSetsOf(source, settings) : [];
  return {
    id: `extra:${today}:${type}`,
    week: source?.week ?? 1,
    type,
    date: today,
    warmup: settings.protocol.warmupOn,
    sets: sets.map((x) => ({ ...x })),
    status: 'planned',
  };
}
