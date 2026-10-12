// The 8-week plan: defaults, session generation, edits with scope, reset to plan.
// Pure functions only, so all rules are unit-tested without a browser.

import { addDays, weekday } from './dates';
import type {
  EditScope,
  Grip,
  HangSession,
  Plan,
  PlannedSession,
  ProgressionStep,
  SessionType,
  SetSpec,
  Settings,
} from './types';

// Values from the requirements doc, "Default blocks" and "Full session progression".
// Where the doc gives a range, the middle is taken: full rest 2-3 min -> 2:30.
// Light sessions use 3-4 sets: 3 in weeks 1-4, 4 in weeks 5-8.
export function defaultSettings(): Settings {
  return {
    protocol: {
      weeks: 8,
      full: {
        restSec: 150,
        steps: [
          { fromWeek: 1, edgeMm: 25, hangSec: 5, sets: 5 },
          { fromWeek: 3, edgeMm: 25, hangSec: 6, sets: 5 },
          { fromWeek: 4, edgeMm: 25, hangSec: 6, sets: 6 },
          { fromWeek: 6, edgeMm: 25, hangSec: 7, sets: 6 },
          { fromWeek: 7, edgeMm: 25, hangSec: 7, sets: 7 },
          { fromWeek: 8, edgeMm: 20, hangSec: 5, sets: 5 },
        ],
      },
      light: {
        restSec: 120,
        steps: [
          { fromWeek: 1, edgeMm: 30, hangSec: 5, sets: 3 },
          { fromWeek: 5, edgeMm: 30, hangSec: 5, sets: 4 },
        ],
      },
      warmup: { edgeMm: 30, hangSec: 10, sets: 3, restSec: 60 },
      warmupOn: true,
      grip: 'half_crimp',
    },
    schedule: { fullDay: 1, lightDay: 4, minGapHours: 48 },
    timer: { countdownSec: 10, prepareSec: 5, beeps: true, voice: true, wakeLock: true },
    rules: { editScope: null },
  };
}

/**
 * Fills fields that settings saved by an older app version do not have yet.
 * Each group is merged one level deep with the defaults.
 */
export function withDefaults(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!saved) return d;
  return {
    protocol: { ...d.protocol, ...saved.protocol },
    schedule: { ...d.schedule, ...saved.schedule },
    timer: { ...d.timer, ...saved.timer },
    rules: { ...d.rules, ...saved.rules },
  };
}

function stepForWeek(steps: ProgressionStep[], week: number): ProgressionStep {
  let current = steps[0];
  for (const s of steps) if (s.fromWeek <= week) current = s;
  return current;
}

/** The planned sets for a week and session type, straight from the protocol. */
export function planSets(settings: Settings, type: SessionType, week: number): SetSpec[] {
  const block = settings.protocol[type];
  const step = stepForWeek(block.steps, week);
  return Array.from({ length: step.sets }, () => ({
    edgeMm: step.edgeMm,
    hangSec: step.hangSec,
    restSec: block.restSec,
    grip: settings.protocol.grip,
    addedKg: 0,
  }));
}

export function sessionId(planId: string, week: number, type: SessionType): string {
  return `${planId}:w${week}:${type}`;
}

/** First date on or after `from` that falls on `day` (0 = Sunday). */
export function nextWeekday(from: string, day: number): string {
  return addDays(from, (day - weekday(from) + 7) % 7);
}

/**
 * Generates the plan. Week 1 starts with the first full-session day on or after `today`;
 * the light session follows on the next light day.
 */
export function generatePlan(settings: Settings, today: string, planId: string): { plan: Plan; sessions: PlannedSession[] } {
  const { fullDay, lightDay } = settings.schedule;
  const startDate = nextWeekday(today, fullDay);
  const lightOffset = (lightDay - fullDay + 7) % 7 || 7;
  const sessions: PlannedSession[] = [];
  for (let week = 1; week <= settings.protocol.weeks; week++) {
    const fullDate = addDays(startDate, (week - 1) * 7);
    for (const [type, date] of [
      ['full', fullDate],
      ['light', addDays(fullDate, lightOffset)],
    ] as const) {
      sessions.push({
        id: sessionId(planId, week, type),
        week,
        type,
        date,
        warmup: settings.protocol.warmupOn,
        sets: planSets(settings, type, week),
        status: 'planned',
      });
    }
  }
  return { plan: { id: planId, startDate, weeks: settings.protocol.weeks }, sessions };
}

export function sortSessions(sessions: PlannedSession[]): PlannedSession[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
}

const isOpen = (s: PlannedSession) => s.status === 'planned' || s.status === 'modified';

/**
 * The next session is the first one, in date order, that is not done or skipped.
 * A missed session stays "next" (shown as overdue) until it is done or skipped;
 * the missed-weeks rule in a later phase moves the plan after long breaks.
 */
export function nextSession(sessions: PlannedSession[]): PlannedSession | null {
  return sortSessions(sessions).find(isOpen) ?? null;
}

export function upcomingSessions(sessions: PlannedSession[], count: number): PlannedSession[] {
  return sortSessions(sessions).filter(isOpen).slice(1, count + 1);
}

/** Hours since the last logged session when that is less than the minimum gap, else null. */
export function tooSoonHours(hangSessions: Pick<HangSession, 'datetime'>[], minGapHours: number, now: Date): number | null {
  let last = -Infinity;
  for (const s of hangSessions) last = Math.max(last, Date.parse(s.datetime));
  if (!Number.isFinite(last)) return null;
  const hours = (now.getTime() - last) / 3_600_000;
  return hours >= 0 && hours < minGapHours ? Math.floor(hours) : null;
}

/** Total session time in seconds: start countdown, warm-up, hangs and rests between work sets. */
export function sessionDurationSec(session: Pick<PlannedSession, 'warmup' | 'sets'>, settings: Settings): number {
  const w = settings.protocol.warmup;
  let total = settings.timer.countdownSec;
  if (session.warmup) total += w.sets * (w.hangSec + w.restSec);
  session.sets.forEach((s, i) => {
    total += s.hangSec;
    if (i < session.sets.length - 1) total += s.restSec;
  });
  return total;
}

/** 150 -> "2:30" */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function range(values: number[], unit: string): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${min}${unit}` : `${min}–${max}${unit}`;
}

/** "25 mm · 5 × 5 s · rest 2:30 · warm-up on" */
export function sessionSummary(session: Pick<PlannedSession, 'warmup' | 'sets'>): string {
  const sets = session.sets;
  if (sets.length === 0) return 'No sets';
  const work = sets.length > 1 ? sets.slice(0, -1) : sets;
  const rests = work.map((s) => s.restSec);
  const rest = Math.min(...rests) === Math.max(...rests) ? formatDuration(rests[0]) : 'mixed';
  return [
    range(sets.map((s) => s.edgeMm), ' mm'),
    `${sets.length} × ${range(sets.map((s) => s.hangSec), ' s')}`,
    `rest ${rest}`,
    `warm-up ${session.warmup ? 'on' : 'off'}`,
  ].join(' · ');
}

// ---- edits ----

/** A change that can be carried to later sessions of the same type. */
export interface SessionPatch {
  warmup?: boolean;
  setDelta: number;
  hangDelta: number;
  edgeMm?: number;
  restSec?: number;
  grip?: Grip;
  addedKg?: number;
}

function uniform<T>(sets: SetSpec[], pick: (s: SetSpec) => T): T | undefined {
  if (sets.length === 0) return undefined;
  const first = pick(sets[0]);
  return sets.every((s) => pick(s) === first) ? first : undefined;
}

/**
 * Finds what changed between the saved session and the edited one, as a patch for later sessions.
 * Only session-wide changes carry over: a field counts when all sets share the new value.
 * Hang time and the number of sets carry over as a difference, so the progression keeps its shape
 * (+1 s in week 2 also gives +1 s in week 6). Edge, rest, grip and weight carry over as the value.
 * A change to one set only stays in this session.
 */
export function diffSessions(before: PlannedSession, after: PlannedSession): SessionPatch {
  const patch: SessionPatch = { setDelta: after.sets.length - before.sets.length, hangDelta: 0 };
  if (after.warmup !== before.warmup) patch.warmup = after.warmup;
  const changed = <T>(pick: (s: SetSpec) => T): T | undefined => {
    const b = uniform(before.sets, pick);
    const a = uniform(after.sets, pick);
    return a !== undefined && a !== b ? a : undefined;
  };
  const edgeMm = changed((s) => s.edgeMm);
  const restSec = changed((s) => s.restSec);
  const grip = changed((s) => s.grip);
  const addedKg = changed((s) => s.addedKg);
  if (edgeMm !== undefined) patch.edgeMm = edgeMm;
  if (restSec !== undefined) patch.restSec = restSec;
  if (grip !== undefined) patch.grip = grip;
  if (addedKg !== undefined) patch.addedKg = addedKg;
  const hb = uniform(before.sets, (s) => s.hangSec);
  const ha = uniform(after.sets, (s) => s.hangSec);
  if (hb !== undefined && ha !== undefined) patch.hangDelta = ha - hb;
  return patch;
}

export function isEmptyPatch(p: SessionPatch): boolean {
  return (
    p.setDelta === 0 &&
    p.hangDelta === 0 &&
    p.warmup === undefined &&
    p.edgeMm === undefined &&
    p.restSec === undefined &&
    p.grip === undefined &&
    p.addedKg === undefined
  );
}

export function applyPatch(session: PlannedSession, patch: SessionPatch): PlannedSession {
  let sets = session.sets.map((s) => ({
    ...s,
    hangSec: Math.max(1, s.hangSec + patch.hangDelta),
    ...(patch.edgeMm !== undefined && { edgeMm: patch.edgeMm }),
    ...(patch.restSec !== undefined && { restSec: patch.restSec }),
    ...(patch.grip !== undefined && { grip: patch.grip }),
    ...(patch.addedKg !== undefined && { addedKg: patch.addedKg }),
  }));
  if (patch.setDelta > 0 && sets.length > 0) {
    const last = sets[sets.length - 1];
    sets = [...sets, ...Array.from({ length: patch.setDelta }, () => ({ ...last }))];
  } else if (patch.setDelta < 0) {
    sets = sets.slice(0, Math.max(1, sets.length + patch.setDelta));
  }
  return { ...session, warmup: patch.warmup ?? session.warmup, sets, status: 'modified' };
}

/**
 * Saves an edited session. With scope 'all', the session-wide part of the change is
 * also applied to every later open session of the same type. Returns all sessions.
 */
export function saveEdit(
  sessions: PlannedSession[],
  edited: PlannedSession,
  scope: EditScope,
): PlannedSession[] {
  const before = sessions.find((s) => s.id === edited.id);
  if (!before) throw new Error(`unknown session ${edited.id}`);
  const saved: PlannedSession = { ...edited, status: edited.status === 'done' ? 'done' : 'modified' };
  const diff = scope === 'all' ? diffSessions(before, edited) : null;
  const patch = diff && !isEmptyPatch(diff) ? diff : null;
  return sessions.map((s) => {
    if (s.id === edited.id) return saved;
    if (patch && s.type === edited.type && s.date > edited.date && isOpen(s)) return applyPatch(s, patch);
    return s;
  });
}

/** The session as the protocol defines it, dropping all edits. */
export function resetToPlan(session: PlannedSession, settings: Settings): PlannedSession {
  return {
    ...session,
    warmup: settings.protocol.warmupOn,
    sets: planSets(settings, session.type, session.week),
    status: session.status === 'done' ? 'done' : 'planned',
  };
}
