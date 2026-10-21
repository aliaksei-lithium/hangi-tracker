// The 8-week plan: defaults, session generation, edits with scope, reset to plan.
// Pure functions only, so all rules are unit-tested without a browser.

import { addDays, weekday } from './dates';
import type {
  EditScope,
  ScheduleDay,
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
    schedule: {
      days: [
        { day: 1, type: 'full' },
        { day: 4, type: 'light' },
      ],
      minGapHours: 48,
    },
    timer: { countdownSec: 10, prepareSec: 5, beeps: true, voice: true, wakeLock: true },
    rules: { editScope: null, suggestions: true, painThreshold: 3, breakDays: 10 },
    general: { theme: 'system' },
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
    schedule: migrateSchedule(d.schedule, saved.schedule),
    timer: { ...d.timer, ...saved.timer },
    rules: { ...d.rules, ...saved.rules },
    general: { ...d.general, ...saved.general },
  };
}

/** Older versions stored one full day and one light day; newer ones a list of days. */
function migrateSchedule(d: Settings['schedule'], saved: unknown): Settings['schedule'] {
  if (!saved || typeof saved !== 'object') return d;
  const old = saved as { days?: ScheduleDay[]; fullDay?: number; lightDay?: number; minGapHours?: number };
  const days =
    old.days ??
    (typeof old.fullDay === 'number' && typeof old.lightDay === 'number'
      ? [
          { day: old.fullDay, type: 'full' as const },
          { day: old.lightDay, type: 'light' as const },
        ]
      : d.days);
  return { days, minGapHours: old.minGapHours ?? d.minGapHours };
}

export function stepForWeek(steps: ProgressionStep[], week: number): ProgressionStep {
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

/** `p1:w3:full`, and `p1:w3:full2` for a second full session in the same week. */
export function sessionId(planId: string, week: number, type: SessionType, n = 1): string {
  return `${planId}:w${week}:${type}${n > 1 ? n : ''}`;
}

/** First date on or after `from` that falls on `day` (0 = Sunday). */
export function nextWeekday(from: string, day: number): string {
  return addDays(from, (day - weekday(from) + 7) % 7);
}

/** Schedule days in the order they come in a 7-day block that starts on `startDate`. */
export function weekSlots(days: ScheduleDay[], startDate: string): { offset: number; type: SessionType }[] {
  const start = weekday(startDate);
  return days.map((d) => ({ offset: (d.day - start + 7) % 7, type: d.type })).sort((a, b) => a.offset - b.offset);
}

/**
 * The first training day on or after `from`. Prefers a full-session day, so a plan
 * starts with a full session; falls back to any training day.
 */
export function firstTrainingDay(days: ScheduleDay[], from: string, type: SessionType = 'full'): string {
  const pool = days.some((d) => d.type === type) ? days.filter((d) => d.type === type) : days;
  return pool.map((d) => nextWeekday(from, d.day)).sort()[0] ?? from;
}

/**
 * Sessions for plan weeks `fromWeek`..`toWeek`. Each week is a 7-day block from
 * `startDate` with one session on every schedule day. `carry` gives plan values kept
 * from earlier sessions (after an accepted suggestion), by week and type.
 */
export function generateWeeks(
  settings: Settings,
  planId: string,
  startDate: string,
  fromWeek: number,
  toWeek: number,
  carry: (week: number, type: SessionType, n: number) => Pick<PlannedSession, 'baseSets' | 'baseWarmup'> | null = () => null,
  setsFor: (type: SessionType, week: number) => SetSpec[] = (type, week) => planSets(settings, type, week),
  warmupOn: boolean = settings.protocol.warmupOn,
): PlannedSession[] {
  const slots = weekSlots(settings.schedule.days, startDate);
  const out: PlannedSession[] = [];
  for (let week = fromWeek; week <= toWeek; week++) {
    const blockStart = addDays(startDate, (week - fromWeek) * 7);
    const count: Partial<Record<SessionType, number>> = {};
    for (const slot of slots) {
      const n = (count[slot.type] = (count[slot.type] ?? 0) + 1);
      const kept = carry(week, slot.type, n);
      const sets = kept?.baseSets ?? setsFor(slot.type, week);
      out.push({
        id: sessionId(planId, week, slot.type, n),
        week,
        type: slot.type,
        date: addDays(blockStart, slot.offset),
        warmup: kept?.baseWarmup ?? warmupOn,
        sets: sets.map((x) => ({ ...x })),
        status: 'planned',
        ...(kept?.baseSets && { baseSets: kept.baseSets }),
        ...(kept?.baseWarmup !== undefined && { baseWarmup: kept.baseWarmup }),
      });
    }
  }
  return out;
}

/**
 * Generates the plan. Week 1 starts on the first full-session day on or after `today`;
 * every week has one session on each schedule day.
 */
export function generatePlan(settings: Settings, today: string, planId: string): { plan: Plan; sessions: PlannedSession[] } {
  const startDate = firstTrainingDay(settings.schedule.days, today);
  const sessions = generateWeeks(settings, planId, startDate, 1, settings.protocol.weeks);
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

function patchSets(sets: SetSpec[], patch: SessionPatch): SetSpec[] {
  let out = sets.map((s) => ({
    ...s,
    hangSec: Math.max(1, s.hangSec + patch.hangDelta),
    ...(patch.edgeMm !== undefined && { edgeMm: patch.edgeMm }),
    ...(patch.restSec !== undefined && { restSec: patch.restSec }),
    ...(patch.grip !== undefined && { grip: patch.grip }),
    ...(patch.addedKg !== undefined && { addedKg: patch.addedKg }),
  }));
  if (patch.setDelta > 0 && out.length > 0) {
    const last = out[out.length - 1];
    out = [...out, ...Array.from({ length: patch.setDelta }, () => ({ ...last }))];
  } else if (patch.setDelta < 0) {
    out = out.slice(0, Math.max(1, out.length + patch.setDelta));
  }
  return out;
}

export function applyPatch(session: PlannedSession, patch: SessionPatch): PlannedSession {
  return { ...session, warmup: patch.warmup ?? session.warmup, sets: patchSets(session.sets, patch), status: 'modified' };
}

const clone = (sets: SetSpec[]) => sets.map((x) => ({ ...x }));
const sameSets = (a: SetSpec[], b: SetSpec[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Saves an edited session.
 * - 'this': a one-off change. The session is marked modified; its plan stays.
 * - 'all': a change of the plan. The edited session's values become its plan, and the
 *   session-wide part of the change is applied to the plan of every later open session
 *   of the same type. "Reset to plan", a new schedule and "repeat last week" keep it.
 *   A later session that had its own one-off change keeps that change on top.
 */
export function saveEdit(
  sessions: PlannedSession[],
  edited: PlannedSession,
  scope: EditScope,
  settings: Settings,
): PlannedSession[] {
  const before = sessions.find((s) => s.id === edited.id);
  if (!before) throw new Error(`unknown session ${edited.id}`);
  const done = edited.status === 'done';
  if (scope === 'this') {
    const saved: PlannedSession = { ...edited, status: done ? 'done' : 'modified' };
    return sessions.map((s) => (s.id === edited.id ? saved : s));
  }

  const saved: PlannedSession = {
    ...edited,
    baseSets: clone(edited.sets),
    baseWarmup: edited.warmup,
    status: done ? 'done' : 'planned',
  };
  const diff = diffSessions(before, edited);
  const patch = isEmptyPatch(diff) ? null : diff;
  return sessions.map((s) => {
    if (s.id === edited.id) return saved;
    if (!patch || s.type !== edited.type || s.date <= edited.date || !isOpen(s)) return s;
    const oldBase = baseSetsOf(s, settings);
    const baseSets = patchSets(oldBase, patch);
    const baseWarmup = patch.warmup ?? s.baseWarmup ?? settings.protocol.warmupOn;
    const oneOff = s.status === 'modified' && (!sameSets(s.sets, oldBase) || s.warmup !== (s.baseWarmup ?? settings.protocol.warmupOn));
    return oneOff
      ? { ...s, sets: patchSets(s.sets, patch), warmup: patch.warmup ?? s.warmup, baseSets, baseWarmup, status: 'modified' }
      : { ...s, sets: clone(baseSets), warmup: baseWarmup, baseSets, baseWarmup, status: 'planned' };
  });
}

/** The plan's sets for a session: after an accepted suggestion, or from the protocol. */
export function baseSetsOf(session: PlannedSession, settings: Settings): SetSpec[] {
  return session.baseSets ?? planSets(settings, session.type, session.week);
}

/** The session as the plan defines it, dropping all edits. */
export function resetToPlan(session: PlannedSession, settings: Settings): PlannedSession {
  return {
    ...session,
    warmup: session.baseWarmup ?? settings.protocol.warmupOn,
    sets: baseSetsOf(session, settings).map((s) => ({ ...s })),
    status: session.status === 'done' ? 'done' : 'planned',
  };
}

/**
 * One-time upgrade for data saved before "this and all next" changed the plan.
 * Back then such an edit marked every later session "modified". When all open
 * sessions of a type are modified (and none has plan values yet), that was a plan
 * change: their values become the plan values. Other sessions stay as they are.
 */
export function adoptPlanEdits(sessions: PlannedSession[]): PlannedSession[] {
  const adopt = new Set<SessionType>();
  for (const type of ['full', 'light'] as const) {
    const open = sessions.filter((s) => s.type === type && isOpen(s));
    if (open.length > 1 && open.every((s) => s.status === 'modified' && !s.baseSets)) adopt.add(type);
  }
  if (adopt.size === 0) return sessions;
  return sessions.map((s) =>
    adopt.has(s.type) && isOpen(s)
      ? { ...s, baseSets: s.sets.map((x) => ({ ...x })), baseWarmup: s.warmup, status: 'planned' }
      : s,
  );
}

/** Open sessions dated before `today`, oldest first. */
export function missedSessions(sessions: PlannedSession[], today: string): PlannedSession[] {
  return sortSessions(sessions).filter((s) => isOpen(s) && s.date < today);
}

/** Marks open sessions as skipped. They stay in the plan, shown as skipped. */
export function skipSessions(sessions: PlannedSession[], ids: string[]): PlannedSession[] {
  const skip = new Set(ids);
  return sessions.map((s) => (skip.has(s.id) && isOpen(s) ? { ...s, status: 'skipped' } : s));
}
