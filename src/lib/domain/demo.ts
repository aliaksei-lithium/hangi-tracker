// Sample data for guest mode: a plan that started four weeks ago, with every past
// session logged, so the progress views have something to show.

import type { DocContent } from '../store/doc';
import { addDays } from './dates';
import { defaultSettings, firstTrainingDay, generateWeeks } from './plan';
import type { HangSession, PlannedSession } from './types';

const RPE = { full: [6, 7, 8, 7, 8], light: [4, 5, 5, 4, 5] };
const PAIN = { full: [1, 0, 2, 1, 1], light: [0, 0, 1, 0, 0] };
const NOTES: Record<string, string> = { 'full-3': 'Last set slipped, skin was dry', 'full-4': 'Felt strong' };

export function demoContent(today: string, planId = 'demo'): DocContent {
  const settings = defaultSettings();
  const start = firstTrainingDay(settings.schedule.days, addDays(today, -28));
  const planned = generateWeeks(settings, planId, start, 1, settings.protocol.weeks);
  const hangSessions: HangSession[] = [];

  const sessions: PlannedSession[] = planned.map((s) => {
    if (s.date >= today) return s;
    const i = Math.min(s.week, 5) - 1;
    // One failed last set in week 3, to show a failed set in the log.
    const sets = s.sets.map((x, k) => {
      const fail = s.type === 'full' && s.week === 3 && k === s.sets.length - 1;
      return { edgeMm: x.edgeMm, targetSec: x.hangSec, actualSec: fail ? x.hangSec - 2 : x.hangSec, completed: !fail };
    });
    hangSessions.push({
      id: `${planId}-log-${s.id}`,
      plannedId: s.id,
      type: s.type,
      week: s.week,
      datetime: new Date(`${s.date}T18:30:00`).toISOString(),
      durationSec: s.type === 'full' ? 860 : 520,
      plannedSets: s.sets.length,
      sets,
      rpe: RPE[s.type][i],
      painLevel: PAIN[s.type][i],
      painLocations: PAIN[s.type][i] ? ['pulley'] : ['none'],
      sharpPain: false,
      bodyweightKg: Math.round((72.5 - s.week * 0.2) * 10) / 10,
      note: NOTES[`${s.type}-${s.week}`] ?? '',
    });
    return { ...s, status: 'done' };
  });

  return { settings, plan: { id: planId, startDate: start, weeks: settings.protocol.weeks }, sessions, hangSessions };
}
