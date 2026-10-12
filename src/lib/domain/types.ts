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
  /**
   * The plan's own sets after an accepted suggestion changed them. "Reset to plan"
   * returns to these; without them it returns to the protocol.
   */
  baseSets?: SetSpec[];
  baseWarmup?: boolean;
}

export interface Plan {
  id: string;
  startDate: string; // date of the first full session
  weeks: number;
  /** Suggestions the user dismissed or accepted, so they do not come back. */
  handled?: string[];
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
    beeps: boolean;
    voice: boolean;
    wakeLock: boolean;
  };
  rules: {
    /** null = ask every time. */
    editScope: EditScope | null;
    suggestions: boolean;
    /** Pain above this level (0-10) suggests a step back. */
    painThreshold: number;
    /** A break longer than this many days suggests going back one week; 0 turns it off. */
    breakDays: number;
  };
  general: {
    theme: 'system' | 'light' | 'dark';
  };
}

export interface HangSet {
  edgeMm: number;
  targetSec: number;
  actualSec: number;
  completed: boolean;
}

export const PAIN_LOCATIONS = ['finger_joint', 'pulley', 'forearm', 'elbow', 'shoulder', 'none'] as const;
export type PainLocation = (typeof PAIN_LOCATIONS)[number];

export interface HangSession {
  id: string;
  plannedId: string | null;
  type: SessionType | null;
  week: number | null;
  datetime: string; // ISO timestamp of the start
  durationSec: number;
  /** Work sets in the session plan; `sets` holds only the sets that were started. */
  plannedSets: number;
  sets: HangSet[];
  rpe: number | null; // 1-10
  painLevel: number | null; // 0-10
  painLocations: PainLocation[];
  /** Sharp finger-joint pain, a click or a pop. Shows the safety message. */
  sharpPain: boolean;
  bodyweightKg: number | null;
  note: string;
}
