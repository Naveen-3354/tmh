/**
 * Streak arithmetic.
 *
 * Deliberately gentle (RESEARCH.md D4): a streak counts up and resets quietly.
 * There is no "broken chain" state, no penalty, and today counts as still-open
 * until it ends — a user who has not logged yet today has not lost anything.
 */

import { addDays, diffDays, type DayKey } from '../time';

export interface StreakSummary {
  /** Consecutive days ending today, or ending yesterday if today is still open. */
  current: number;
  /** Longest run anywhere in the supplied history. */
  longest: number;
  /** Most recent day with activity, if any. */
  lastActiveDay: DayKey | null;
}

/**
 * @param activeDays Days on which the user logged the tracked thing. Order and
 *   duplicates do not matter.
 * @param today The user's *local* today, so the grace period lines up with
 *   their day rather than UTC's.
 */
export function computeStreak(activeDays: readonly DayKey[], today: DayKey): StreakSummary {
  if (activeDays.length === 0) {
    return { current: 0, longest: 0, lastActiveDay: null };
  }

  const unique = [...new Set(activeDays)].sort();
  const lastActiveDay = unique[unique.length - 1] ?? null;

  let longest = 1;
  let run = 1;
  for (let index = 1; index < unique.length; index += 1) {
    const previous = unique[index - 1];
    const current = unique[index];
    if (previous === undefined || current === undefined) continue;
    run = diffDays(previous, current) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  return { current: currentRunLength(unique, today), longest, lastActiveDay };
}

/**
 * Walk backwards from today counting consecutive logged days.
 *
 * Today being unlogged does not end the streak — the day is not over. The
 * streak is only considered ended once *yesterday* is also missing.
 */
function currentRunLength(sortedUnique: readonly DayKey[], today: DayKey): number {
  const logged = new Set(sortedUnique);
  const yesterday = addDays(today, -1);

  let cursor: DayKey;
  if (logged.has(today)) {
    cursor = today;
  } else if (logged.has(yesterday)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let count = 0;
  while (logged.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * Fill a date window with a logged/not-logged flag, for calendar heatmaps.
 * Missing days are neutral gaps, never failures.
 */
export function streakCalendar(
  activeDays: readonly DayKey[],
  from: DayKey,
  to: DayKey,
): { day: DayKey; active: boolean }[] {
  const logged = new Set(activeDays);
  const span = diffDays(from, to);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, index) => {
    const day = addDays(from, index);
    return { day, active: logged.has(day) };
  });
}
