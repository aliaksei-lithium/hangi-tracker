// Training blocks: plan the next block (continue, smaller edge or repeat), with an
// optional easy week, and the values that block builds up through.

import { addDays } from './dates';
import { baseSetsOf, defaultSettings, firstTrainingDay, generateWeeks, sortSessions } from './plan';
import { EDGES_MM, type BlockConfig, type HangSession, type Plan, type PlannedSession, type SessionType, type SetSpec, type Settings } from './types';

export const BLOCK_LENGTHS = [4, 6, 8, 10, 12] as const;

// How a block builds up over 8 weeks, as (extra sets, extra seconds) over the start
// values. Same order as the requirements: more sets first, then longer hangs.
const BUILD: [number, number][] = [
  [0, 0],
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 1],
  [1, 2],
  [2, 2],
  [2, 2],
];

/**
 * Where in the build-up a week is. A block of up to 8 weeks follows the first weeks of
 * the build-up (a short block ends lower); a longer block stretches it evenly.
 */
function buildStep(week: number, weeks: number): [number, number] {
  const i = weeks <= BUILD.length ? week - 1 : Math.floor(((week - 1) * BUILD.length) / weeks);
  return BUILD[Math.min(BUILD.length - 1, Math.max(0, i))];
}

/** The planned sets of a block week. Week 0 is the easy week. */
export function blockSets(b: BlockConfig, type: SessionType, week: number): SetSpec[] {
  const make = (n: number, edgeMm: number, hangSec: number, restSec: number) =>
    Array.from({ length: n }, () => ({ edgeMm, hangSec, restSec, grip: b.grip, addedKg: 0 }));
  if (week === 0) return make(type === 'full' ? 3 : 2, b.lightEdgeMm, 5, b.lightRestSec);
  if (type === 'light') return make(week > Math.ceil(b.weeks / 2) ? 4 : 3, b.lightEdgeMm, 5, b.lightRestSec);
  const [extraSets, extraSec] = buildStep(week, b.weeks);
  return make(b.startSets + extraSets, b.fullEdgeMm, b.startHangSec + extraSec, b.fullRestSec);
}

/** First and last week of full sessions, for a short summary. */
export function blockRange(b: BlockConfig): { first: SetSpec[]; last: SetSpec[] } {
  return { first: blockSets(b, 'full', 1), last: blockSets(b, 'full', b.weeks) };
}

/** Builds a block. It starts on the first training day on or after `from`. */
export function generateBlock(
  settings: Settings,
  b: BlockConfig,
  planId: string,
  from: string,
  number: number,
): { plan: Plan; sessions: PlannedSession[] } {
  const first = firstTrainingDay(settings.schedule.days, from);
  const setsFor = (type: SessionType, week: number) => blockSets(b, type, week);
  const withBase = (s: PlannedSession) => ({ ...s, baseSets: s.sets.map((x) => ({ ...x })), baseWarmup: s.warmup });
  const easy = b.easyWeek ? generateWeeks(settings, planId, first, 0, 0, undefined, setsFor, b.warmup) : [];
  const startDate = b.easyWeek ? addDays(first, 7) : first;
  const weeks = generateWeeks(settings, planId, startDate, 1, b.weeks, undefined, setsFor, b.warmup);
  return {
    plan: { id: planId, startDate, weeks: b.weeks, block: b, number },
    sessions: [...easy, ...weeks].map(withBase),
  };
}

const isOpen = (s: PlannedSession) => s.status === 'planned' || s.status === 'modified';
const ofPlan = (id: string | null, plan: Plan) => !!id && id.startsWith(`${plan.id}:`);

/** The start values of the current block (derived from week 1 for the first plan). */
export function currentBlock(plan: Plan, sessions: PlannedSession[], settings: Settings): BlockConfig {
  if (plan.block) return plan.block;
  const mine = sortSessions(sessions).filter((s) => ofPlan(s.id, plan));
  const full = mine.find((s) => s.type === 'full' && s.week >= 1);
  const light = mine.find((s) => s.type === 'light' && s.week >= 1);
  const fs = full ? baseSetsOf(full, settings) : [];
  const ls = light ? baseSetsOf(light, settings) : [];
  const d = defaultSettings().protocol;
  return {
    fullEdgeMm: fs[0]?.edgeMm ?? d.full.steps[0].edgeMm,
    startHangSec: fs[0]?.hangSec ?? d.full.steps[0].hangSec,
    startSets: fs.length || d.full.steps[0].sets,
    lightEdgeMm: ls[0]?.edgeMm ?? d.light.steps[0].edgeMm,
    weeks: plan.weeks,
    easyWeek: false,
    fullRestSec: fs[0]?.restSec ?? settings.protocol.full.restSec,
    lightRestSec: ls[0]?.restSec ?? settings.protocol.light.restSec,
    grip: fs[0]?.grip ?? settings.protocol.grip,
    warmup: full?.baseWarmup ?? full?.warmup ?? settings.protocol.warmupOn,
  };
}

export type BlockChoice = 'continue' | 'smaller' | 'repeat';

export interface BlockPlanning {
  options: Record<BlockChoice, BlockConfig | null>;
  recommended: BlockChoice;
  easyWeek: boolean;
  /** Sessions of the current block. */
  done: number;
  skipped: number;
  total: number;
  open: number;
  /** The current week, when the block is still running. */
  week: number | null;
}

/**
 * Options for the next block, from the current block and the log:
 * - continue: the same edge, starting at the longest completed hang reached on it;
 * - smaller: the next smaller edge at 5 s × 5 (none on the smallest edge);
 * - repeat: the same start values as this block.
 * Smaller is recommended when a recent full session reached 7 s on 6+ sets with low pain.
 */
export function planNextBlock(plan: Plan, sessions: PlannedSession[], log: HangSession[], settings: Settings): BlockPlanning {
  const cur = currentBlock(plan, sessions, settings);
  const mine = sessions.filter((s) => ofPlan(s.id, plan));
  const fullLogs = log
    .filter((h) => h.type === 'full' && ofPlan(h.plannedId, plan))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  const onEdge = fullLogs.flatMap((h) => h.sets.filter((x) => x.completed && x.edgeMm === cur.fullEdgeMm));
  const reached = onEdge.length ? Math.max(...onEdge.map((x) => x.actualSec)) : cur.startHangSec;
  const smallerEdge = [...EDGES_MM].reverse().find((e) => e < cur.fullEdgeMm);

  const recent = fullLogs.slice(-2);
  const metBar =
    smallerEdge !== undefined &&
    recent.some(
      (h) =>
        h.sets.length >= 6 &&
        h.sets.every((x) => x.completed && x.actualSec >= 7) &&
        (h.painLevel ?? 0) < settings.rules.painThreshold &&
        !h.sharpPain,
    );

  const base: BlockConfig = { ...cur, easyWeek: false };
  const options: Record<BlockChoice, BlockConfig | null> = {
    continue: { ...base, startHangSec: Math.max(cur.startHangSec, reached) },
    smaller: smallerEdge === undefined ? null : { ...base, fullEdgeMm: smallerEdge, startHangSec: 5, startSets: 5 },
    repeat: { ...base },
  };
  const done = mine.filter((s) => s.status === 'done').length;
  const open = mine.filter(isOpen);
  const next = sortSessions(open)[0];
  return {
    options,
    recommended: metBar ? 'smaller' : fullLogs.length ? 'continue' : 'repeat',
    // An easy week after a real block of training; not when restarting early.
    easyWeek: done >= 6,
    done,
    skipped: mine.filter((s) => s.status === 'skipped').length,
    total: mine.length,
    open: open.length,
    week: next ? next.week : null,
  };
}

/** Open sessions that a new block replaces. */
export function openSessionIds(sessions: PlannedSession[]): string[] {
  return sessions.filter(isOpen).map((s) => s.id);
}
