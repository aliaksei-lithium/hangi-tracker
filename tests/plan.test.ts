import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatShortDate, weekday } from '../src/lib/domain/dates';
import {
  defaultSettings,
  diffSessions,
  formatDuration,
  generatePlan,
  nextSession,
  resetToPlan,
  saveEdit,
  sessionDurationSec,
  sessionSummary,
  tooSoonHours,
  upcomingSessions,
  withDefaults,
  adoptPlanEdits,
  missedSessions,
  skipSessions,
} from '../src/lib/domain/plan';
import type { PlannedSession } from '../src/lib/domain/types';

const settings = defaultSettings();
// 2026-10-13 is a Tuesday.
const { plan, sessions } = generatePlan(settings, '2026-10-13', 'p1');
const byId = (id: string) => sessions.find((s) => s.id === id)!;
const shape = (s: PlannedSession) => `${s.sets[0].edgeMm}mm ${s.sets.length}x${s.sets[0].hangSec}s`;

describe('dates', () => {
  it('adds days across month ends and DST changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-10-13', '2026-10-19')).toBe(6);
    expect(weekday('2026-10-13')).toBe(2);
    expect(formatShortDate('2026-10-15')).toBe('Thu 15 Oct');
  });
});

describe('generatePlan', () => {
  it('makes 8 weeks with a full session on Monday and a light one on Thursday', () => {
    expect(sessions).toHaveLength(16);
    expect(plan.startDate).toBe('2026-10-19');
    expect(byId('p1:w1:full').date).toBe('2026-10-19');
    expect(byId('p1:w1:light').date).toBe('2026-10-22');
    expect(byId('p1:w8:full').date).toBe('2026-12-07');
    expect(sessions.every((s) => s.status === 'planned' && s.warmup)).toBe(true);
  });

  it('starts today when today is the full-session day', () => {
    expect(generatePlan(settings, '2026-10-19', 'p').plan.startDate).toBe('2026-10-19');
  });

  it('follows the full-session progression table', () => {
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => shape(byId(`p1:w${w}:full`)));
    expect(weeks).toEqual([
      '25mm 5x5s',
      '25mm 5x5s',
      '25mm 5x6s',
      '25mm 6x6s',
      '25mm 6x6s',
      '25mm 6x7s',
      '25mm 7x7s',
      '20mm 5x5s',
    ]);
    expect(byId('p1:w1:full').sets[0].restSec).toBe(150);
  });

  it('keeps light sessions on 30 mm with 3 to 4 sets', () => {
    expect(shape(byId('p1:w1:light'))).toBe('30mm 3x5s');
    expect(shape(byId('p1:w5:light'))).toBe('30mm 4x5s');
    expect(byId('p1:w1:light').sets[0].restSec).toBe(120);
  });

  it('handles a light day earlier in the week than the full day', () => {
    const s = { ...settings, schedule: { ...settings.schedule, days: [{ day: 4, type: 'full' as const }, { day: 1, type: 'light' as const }] } };
    const g = generatePlan(s, '2026-10-13', 'p');
    expect(g.sessions[0].date).toBe('2026-10-15'); // Thursday
    expect(g.sessions[1].date).toBe('2026-10-19'); // following Monday
  });
});

describe('next and upcoming sessions', () => {
  it('picks the first open session in date order', () => {
    expect(nextSession(sessions)?.id).toBe('p1:w1:full');
    const done = sessions.map((s) => (s.id === 'p1:w1:full' ? { ...s, status: 'done' as const } : s));
    expect(nextSession(done)?.id).toBe('p1:w1:light');
    expect(upcomingSessions(done, 2).map((s) => s.id)).toEqual(['p1:w2:full', 'p1:w2:light']);
  });

  it('returns null when everything is done', () => {
    expect(nextSession(sessions.map((s) => ({ ...s, status: 'done' as const })))).toBeNull();
  });
});

describe('tooSoonHours', () => {
  const now = new Date('2026-10-13T18:00:00Z');
  it('warns when the last session was less than 48 hours ago', () => {
    const log = [{ datetime: '2026-10-12T16:00:00Z' }];
    expect(tooSoonHours(log, 48, now)).toBe(26);
  });
  it('is quiet after 48 hours or without sessions', () => {
    expect(tooSoonHours([{ datetime: '2026-10-11T17:00:00Z' }], 48, now)).toBeNull();
    expect(tooSoonHours([], 48, now)).toBeNull();
  });
});

describe('duration and summary', () => {
  const w1 = byId('p1:w1:full');
  it('adds countdown, warm-up, hangs and rests between work sets', () => {
    // 10 + 3 * (10 + 60) + 5 * 5 + 4 * 150
    expect(sessionDurationSec(w1, settings)).toBe(10 + 210 + 25 + 600);
    expect(sessionDurationSec({ ...w1, warmup: false }, settings)).toBe(10 + 25 + 600);
    expect(formatDuration(845)).toBe('14:05');
  });
  it('summarises like the design', () => {
    expect(sessionSummary(w1)).toBe('25 mm · 5 × 5 s · rest 2:30 · warm-up on');
    const mixed = { ...w1, warmup: false, sets: [{ ...w1.sets[0], edgeMm: 20 }, ...w1.sets.slice(1)] };
    expect(sessionSummary(mixed)).toBe('20–25 mm · 5 × 5 s · rest 2:30 · warm-up off');
  });
});

describe('saveEdit', () => {
  const w2 = byId('p1:w2:full');

  it('with scope "this" changes only the edited session', () => {
    const edited = { ...w2, sets: w2.sets.map((s) => ({ ...s, restSec: 180 })) };
    const out = saveEdit(sessions, edited, 'this', settings);
    expect(out.find((s) => s.id === w2.id)!.status).toBe('modified');
    expect(out.find((s) => s.id === w2.id)!.sets[0].restSec).toBe(180);
    expect(out.find((s) => s.id === 'p1:w3:full')!.sets[0].restSec).toBe(150);
    expect(out.find((s) => s.id === 'p1:w3:full')!.status).toBe('planned');
  });

  it('with scope "all" carries session-wide values to later sessions of the same type', () => {
    const edited = { ...w2, warmup: false, sets: w2.sets.map((s) => ({ ...s, restSec: 180, edgeMm: 20 })) };
    const out = saveEdit(sessions, edited, 'all', settings);
    for (const id of ['p1:w3:full', 'p1:w8:full']) {
      const s = out.find((x) => x.id === id)!;
      expect(s.sets.every((x) => x.restSec === 180 && x.edgeMm === 20)).toBe(true);
      expect(s.warmup).toBe(false);
      // It is now the plan, not a one-off change.
      expect(s.status).toBe('planned');
      expect(resetToPlan(s, settings).sets).toEqual(s.sets);
      expect(resetToPlan(s, settings).warmup).toBe(false);
    }
    const saved = out.find((x) => x.id === w2.id)!;
    expect(saved.status).toBe('planned');
    expect(saved.baseSets).toEqual(saved.sets);
    // Earlier sessions and the other type stay as planned.
    expect(out.find((s) => s.id === 'p1:w1:full')!.sets[0].restSec).toBe(150);
    expect(out.find((s) => s.id === 'p1:w3:light')!.sets[0].restSec).toBe(120);
  });

  it('carries hang time and set count as a difference, keeping the progression', () => {
    const edited = { ...w2, sets: [...w2.sets, { ...w2.sets[0] }].map((s) => ({ ...s, hangSec: s.hangSec + 1 })) };
    const out = saveEdit(sessions, edited, 'all', settings);
    expect(shape(out.find((s) => s.id === 'p1:w3:full')!)).toBe('25mm 6x7s');
    expect(shape(out.find((s) => s.id === 'p1:w7:full')!)).toBe('25mm 8x8s');
  });

  it('keeps a change to one set in this session only', () => {
    const edited = { ...w2, sets: w2.sets.map((s, i) => (i === 2 ? { ...s, edgeMm: 20 } : s)) };
    expect(diffSessions(w2, edited)).toEqual({ setDelta: 0, hangDelta: 0 });
    const out = saveEdit(sessions, edited, 'all', settings);
    expect(out.find((s) => s.id === 'p1:w3:full')!.status).toBe('planned');
  });

  it('keeps a one-off change of a later session on top of the new plan', () => {
    const w4 = byId('p1:w4:full');
    const oneOff = saveEdit(sessions, { ...w4, sets: w4.sets.slice(0, 3) }, 'this', settings);
    const edited = { ...w2, sets: w2.sets.map((s) => ({ ...s, restSec: 180 })) };
    const out = saveEdit(oneOff, edited, 'all', settings);
    const s4 = out.find((s) => s.id === w4.id)!;
    expect(s4.status).toBe('modified');
    expect(s4.sets).toHaveLength(3); // the one-off change stays
    expect(s4.sets[0].restSec).toBe(180); // and gets the plan change
    expect(s4.baseSets).toHaveLength(6); // the plan itself has 6 sets
    expect(resetToPlan(s4, settings).sets.map((x) => x.restSec)).toEqual([180, 180, 180, 180, 180, 180]);
  });

  it('with scope "this" keeps the plan for reset', () => {
    const edited = { ...w2, sets: w2.sets.map((s) => ({ ...s, restSec: 180 })) };
    const s = saveEdit(sessions, edited, 'this', settings).find((x) => x.id === w2.id)!;
    expect(resetToPlan(s, settings).sets[0].restSec).toBe(150);
  });

  it('does not touch done sessions', () => {
    const withDone = sessions.map((s) => (s.id === 'p1:w3:full' ? { ...s, status: 'done' as const } : s));
    const edited = { ...w2, sets: w2.sets.map((s) => ({ ...s, restSec: 180 })) };
    const out = saveEdit(withDone, edited, 'all', settings);
    expect(out.find((s) => s.id === 'p1:w3:full')!.sets[0].restSec).toBe(150);
    expect(out.find((s) => s.id === 'p1:w4:full')!.sets[0].restSec).toBe(180);
  });
});

describe('resetToPlan', () => {
  it('restores the protocol values', () => {
    const w6 = byId('p1:w6:full');
    const edited = { ...w6, warmup: false, status: 'modified' as const, sets: w6.sets.slice(0, 2) };
    const reset = resetToPlan(edited, settings);
    expect(shape(reset)).toBe('25mm 6x7s');
    expect(reset.warmup).toBe(true);
    expect(reset.status).toBe('planned');
  });
});

describe('withDefaults', () => {
  it('adds settings fields that older saved data does not have', () => {
    const old = defaultSettings() as unknown as { timer: Record<string, unknown> };
    delete old.timer.voice;
    const merged = withDefaults(old as never);
    expect(merged.timer.voice).toBe(true);
    expect(merged.timer.countdownSec).toBe(10);
  });
});

describe('flexible schedule', () => {
  const mwf = {
    ...settings,
    schedule: {
      ...settings.schedule,
      days: [
        { day: 1, type: 'full' as const },
        { day: 3, type: 'light' as const },
        { day: 5, type: 'full' as const },
      ],
    },
  };

  it('makes one session per schedule day, starting on a full day', () => {
    const g = generatePlan(mwf, '2026-10-13', 'p'); // Tuesday
    expect(g.plan.startDate).toBe('2026-10-16'); // Friday, the first full day
    const w1 = g.sessions.filter((s) => s.week === 1);
    expect(w1.map((s) => [s.id, s.date])).toEqual([
      ['p:w1:full', '2026-10-16'],
      ['p:w1:full2', '2026-10-19'],
      ['p:w1:light', '2026-10-21'],
    ]);
    expect(g.sessions).toHaveLength(24);
    expect(new Set(g.sessions.map((s) => s.id)).size).toBe(24);
  });

  it('reads the schedule of older versions', () => {
    const old = { ...defaultSettings(), schedule: { fullDay: 2, lightDay: 5, minGapHours: 36 } } as never;
    expect(withDefaults(old).schedule).toEqual({
      days: [
        { day: 2, type: 'full' },
        { day: 5, type: 'light' },
      ],
      minGapHours: 36,
    });
  });
});

describe('adoptPlanEdits', () => {
  // Like real data saved before 0.5.0: every full session edited, light ones not.
  const edited = sessions.map((s) =>
    s.type === 'full' ? { ...s, status: 'modified' as const, sets: s.sets.map((x) => ({ ...x, hangSec: x.hangSec + 1, restSec: 120 })) } : s,
  );

  it('turns a change on every open session of a type into the plan', () => {
    const out = adoptPlanEdits(edited);
    const w1 = out.find((s) => s.id === 'p1:w1:full')!;
    expect(w1.status).toBe('planned');
    expect(resetToPlan(w1, settings).sets[0]).toMatchObject({ edgeMm: 25, hangSec: 6, restSec: 120 });
    // Light sessions were not changed and stay as they are.
    expect(out.find((s) => s.id === 'p1:w1:light')).toEqual(edited.find((s) => s.id === 'p1:w1:light'));
  });

  it('leaves one-off changes alone', () => {
    const oneOff = sessions.map((s) => (s.id === 'p1:w2:full' ? { ...s, status: 'modified' as const } : s));
    expect(adoptPlanEdits(oneOff)).toBe(oneOff);
  });

  it('does nothing twice', () => {
    const once = adoptPlanEdits(edited);
    expect(adoptPlanEdits(once)).toBe(once);
  });
});

describe('skipping', () => {
  it('finds missed sessions and skips only open ones', () => {
    const withDone = sessions.map((s) => (s.id === 'p1:w1:full' ? { ...s, status: 'done' as const } : s));
    const missed = missedSessions(withDone, '2026-10-27');
    expect(missed.map((s) => s.id)).toEqual(['p1:w1:light', 'p1:w2:full']);
    const out = skipSessions(withDone, ['p1:w1:full', 'p1:w1:light']);
    expect(out.find((s) => s.id === 'p1:w1:full')!.status).toBe('done'); // done stays done
    expect(out.find((s) => s.id === 'p1:w1:light')!.status).toBe('skipped');
    expect(nextSession(out)?.id).toBe('p1:w2:full');
  });
});
