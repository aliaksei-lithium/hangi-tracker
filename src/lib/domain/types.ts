// Data model, following the "Data model sketch" in the requirements doc.
// Dates without time are local calendar dates as 'YYYY-MM-DD' strings.

export type SessionType = 'full' | 'light';
export type Grip = 'half_crimp' | 'open_hand';
export type PlannedStatus = 'planned' | 'done' | 'skipped' | 'modified';
export type EditScope = 'this' | 'all';

export const EDGES_MM = [15, 20, 25, 30] as const;

export interface SetSpec {
  edgeMm: number;
  hangSec: number;
  /** Rest after this set. Ignored for the last set of a session. */
  restSec: number;
  grip: Grip;
  /** Added weight in kg; negative means assistance. */
  addedKg: number;
}

export interface PlannedSession {
  id: string;
  week: number; // 1-based plan week
  type: SessionType;
  date: string; // YYYY-MM-DD
  warmup: boolean;
  sets: SetSpec[];
  status: PlannedStatus;
}

export interface Plan {
  id: string;
  startDate: string; // date of the first full session
  weeks: number;
}

/** One row of a progression table: from week `fromWeek` on, until the next row. */
export interface ProgressionStep {
  fromWeek: number;
  edgeMm: number;
  hangSec: number;
  sets: number;
}

export interface WarmupSpec {
  edgeMm: number;
  hangSec: number;
  sets: number;
  restSec: number;
}

export interface Settings {
  protocol: {
    weeks: number;
    full: { restSec: number; steps: ProgressionStep[] };
    light: { restSec: number; steps: ProgressionStep[] };
    warmup: WarmupSpec;
    warmupOn: boolean;
    grip: Grip;
  };
  schedule: {
    fullDay: number; // 0 = Sunday ... 6 = Saturday, like Date.getDay()
    lightDay: number;
    minGapHours: number;
  };
  timer: {
    countdownSec: number;
    prepareSec: number;
  };
  rules: {
    /** null = ask every time. */
    editScope: EditScope | null;
  };
}

export interface HangSet {
  edgeMm: number;
  targetSec: number;
  actualSec: number;
  completed: boolean;
}

export interface HangSession {
  id: string;
  plannedId: string | null;
  datetime: string; // ISO timestamp
  sets: HangSet[];
}
