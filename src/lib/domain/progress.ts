// Progress views, computed from the log and the plan only (no user input).

import { addDays, daysBetween, toIsoDate } from './dates';
import type { HangSession, Plan, PlannedSession } from './types';

const localDate = (iso: string) => toIsoDate(new Date(iso));

/** Plan week of a logged session: its own week, or from its date. */
/** True for planned sessions of this plan (ids start with the plan id). */
export const inPlan = (id: string | null, plan: Plan) => !!id && id.startsWith(`${plan.id}:`);

export function weekOf(s: HangSession, plan: Plan): number | null {
  // A stored week only counts for sessions of this plan; older blocks have their own weeks.
  if (s.week && inPlan(s.plannedId, plan)) return s.week;
  const d = daysBetween(plan.startDate, localDate(s.datetime));
  const w = Math.floor(d / 7) + 1;
  return w >= 1 && w <= plan.weeks ? w : null;
}

export const timeUnderLoad = (s: HangSession) => s.sets.reduce((sum, x) => sum + x.actualSec, 0);

export interface WeekLoad {
  week: number;
  doneSec: number;
  plannedSec: number;
}

/** Time under load per plan week: done from the log, planned from the plan. */
export function weeklyLoad(plan: Plan, planned: PlannedSession[], log: HangSession[]): WeekLoad[] {
  return Array.from({ length: plan.weeks }, (_, i) => {
    const week = i + 1;
    const doneSec = log.filter((s) => weekOf(s, plan) === week).reduce((sum, s) => sum + timeUnderLoad(s), 0);
    const plannedSec = planned
      .filter((p) => p.week === week && p.status !== 'skipped' && inPlan(p.id, plan))
      .reduce((sum, p) => sum + p.sets.reduce((t, x) => t + x.hangSec, 0), 0);
    return { week, doneSec, plannedSec };
  });
}

export interface SessionPoint {
  id: string;
  date: string; // YYYY-MM-DD
  edgeMm: number; // smallest edge used
  hangSec: number; // longest completed hang (or longest held when none completed)
  rpe: number | null;
  pain: number | null;
}

/** One point per logged session, oldest first. */
export function sessionSeries(log: HangSession[]): SessionPoint[] {
  return [...log]
    .filter((s) => s.sets.length > 0)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .map((s) => {
      const done = s.sets.filter((x) => x.completed);
      return {
        id: s.id,
        date: localDate(s.datetime),
        edgeMm: Math.min(...s.sets.map((x) => x.edgeMm)),
        hangSec: Math.max(...(done.length ? done : s.sets).map((x) => x.actualSec)),
        rpe: s.rpe,
        pain: s.painLevel,
      };
    });
}

export interface EdgeRecord {
  edgeMm: number;
  bestSec: number | null;
  date: string | null;
}

/**
 * Best completed hang on each edge, and the session with the most time under load.
 * On a tie the record keeps the date it was first reached.
 */
export function records(all: HangSession[], edges: readonly number[]): { edges: EdgeRecord[]; volume: { sec: number; date: string } | null } {
  const log = [...all].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const out = edges.map((edgeMm) => {
    let best: EdgeRecord = { edgeMm, bestSec: null, date: null };
    for (const s of log) {
      for (const x of s.sets) {
        if (x.edgeMm === edgeMm && x.completed && (best.bestSec === null || x.actualSec > best.bestSec)) {
          best = { edgeMm, bestSec: x.actualSec, date: localDate(s.datetime) };
        }
      }
    }
    return best;
  });
  let volume: { sec: number; date: string } | null = null;
  for (const s of log) {
    const sec = timeUnderLoad(s);
    if (sec > 0 && (!volume || sec > volume.sec)) volume = { sec, date: localDate(s.datetime) };
  }
  return { edges: out, volume };
}

export type DayMark = 'done' | 'planned' | 'skipped' | 'missed' | null;

export interface CalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
  mark: DayMark;
  today: boolean;
}

/** Month grid, Monday first, 5 or 6 weeks. `month` is 'YYYY-MM'. */
export function calendar(month: string, planned: PlannedSession[], log: HangSession[], today: string): CalendarDay[] {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const weekdayMon = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const start = addDays(first, -weekdayMon);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((weekdayMon + daysInMonth) / 7) * 7;
  const doneDates = new Set(log.map((s) => localDate(s.datetime)));
  return Array.from({ length: cells }, (_, i) => {
    const date = addDays(start, i);
    let mark: DayMark = null;
    if (doneDates.has(date)) mark = 'done';
    else {
      const p = planned.find((x) => x.date === date);
      if (p?.status === 'skipped') mark = 'skipped';
      else if (p && p.status !== 'done') mark = date < today ? 'missed' : 'planned';
    }
    return { date, day: Number(date.slice(8)), inMonth: date.startsWith(month), mark, today: date === today };
  });
}

export type PlanStatus = 'done' | 'skipped' | 'modified' | 'missed';

export interface PlanRow {
  id: string;
  date: string;
  planned: PlannedSession;
  entry: HangSession | null;
  status: PlanStatus;
}

/**
 * Plan vs actual, newest first: sessions that are done, skipped, missed (in the past
 * and still open) or changed from the plan.
 */
export function planVsActual(planned: PlannedSession[], log: HangSession[], today: string): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const p of planned) {
    const entry = log.find((s) => s.plannedId === p.id) ?? null;
    let status: PlanStatus | null = null;
    if (p.status === 'done' || entry) status = 'done';
    else if (p.status === 'skipped') status = 'skipped';
    else if (p.date < today) status = 'missed';
    else if (p.status === 'modified') status = 'modified';
    if (status) rows.push({ id: p.id, date: entry ? localDate(entry.datetime) : p.date, planned: p, entry, status });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export interface WeekRow {
  week: number;
  edgeMm: number;
  hangSec: number;
  setsDone: number;
  sessions: number;
  notes: string;
}

/** Week table in the plan's format, filled from the log. */
export function weekTable(plan: Plan, log: HangSession[]): WeekRow[] {
  const rows: WeekRow[] = [];
  for (let week = 1; week <= plan.weeks; week++) {
    const inWeek = log.filter((s) => weekOf(s, plan) === week && s.sets.length > 0);
    if (!inWeek.length) continue;
    const sets = inWeek.flatMap((s) => s.sets);
    const done = sets.filter((x) => x.completed);
    rows.push({
      week,
      edgeMm: Math.min(...sets.map((x) => x.edgeMm)),
      hangSec: Math.max(...(done.length ? done : sets).map((x) => x.actualSec)),
      setsDone: done.length,
      sessions: inWeek.length,
      notes: inWeek.map((s) => s.note).filter(Boolean).join('; '),
    });
  }
  return rows;
}
