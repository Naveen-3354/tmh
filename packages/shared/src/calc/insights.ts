/**
 * Rule-based observations over the user's own logged data.
 *
 * Hard constraints from the brief (§8), enforced here rather than left to UI
 * copy:
 *
 *   - Every insight states the window and the sample size it is drawn from.
 *   - Nothing is emitted below MIN_GROUP_SIZE observations per group. Silence
 *     is correct when there is not enough data; a confident-sounding claim
 *     from three nights is worse than no claim.
 *   - Wording describes a pattern in logged data. Never a diagnosis, never a
 *     prescription, never "you should".
 *
 * These are correlations over a handful of self-reported days. They are
 * presented as things the user noticed about themselves, not findings.
 */

import { round } from '../units';
import type { DayKey } from '../time';

/** One day's worth of metrics. Nulls mean "not logged", never zero. */
export interface DailyMetrics {
  day: DayKey;
  sleepMinutes: number | null;
  /** Mood recorded on this day, 1–5. */
  mood: number | null;
  steps: number | null;
  activeMinutes: number;
  waterMl: number;
  calories: number | null;
  proteinG: number | null;
  weightKg: number | null;
}

export interface Insight {
  id: string;
  kind: 'correlation' | 'trend' | 'consistency';
  /** Short, neutral summary. */
  title: string;
  /** The observation, always including its evidence. */
  detail: string;
  /** Days the observation draws on. Always shown to the user. */
  sampleSize: number;
  windowDays: number;
  /** Drives the accent colour of the card. */
  metric: 'sleep' | 'mood' | 'move' | 'water' | 'energy' | 'vitals';
}

/** Below this many observations in either group, we say nothing. */
export const MIN_GROUP_SIZE = 5;

/** Below this difference the two groups are treated as indistinguishable. */
const MIN_MOOD_DIFFERENCE = 0.5;
const MIN_STEP_DIFFERENCE = 800;

const SHORT_SLEEP_MINUTES = 6 * 60;
const ADEQUATE_SLEEP_MINUTES = 7 * 60;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Pair each day's sleep with the *following* day's outcome.
 *
 * Sleep is attributed to the morning you woke up, so its effect belongs to
 * that same day — but the interesting comparison for mood and activity is how
 * the day went, which is recorded later the same day. Both live on the same
 * DailyMetrics row, so no shifting is needed; this helper just drops days
 * where either side is missing.
 */
function pairedBySleep<T>(
  days: readonly DailyMetrics[],
  pick: (day: DailyMetrics) => T | null,
): { short: T[]; adequate: T[] } {
  const short: T[] = [];
  const adequate: T[] = [];

  for (const day of days) {
    const outcome = pick(day);
    if (!isPresent(day.sleepMinutes) || !isPresent(outcome)) continue;
    if (day.sleepMinutes < SHORT_SLEEP_MINUTES) short.push(outcome);
    else if (day.sleepMinutes >= ADEQUATE_SLEEP_MINUTES) adequate.push(outcome);
  }

  return { short, adequate };
}

function sleepMoodInsight(days: readonly DailyMetrics[], windowDays: number): Insight | null {
  const { short, adequate } = pairedBySleep(days, (day) => day.mood);
  if (short.length < MIN_GROUP_SIZE || adequate.length < MIN_GROUP_SIZE) return null;

  const shortMean = mean(short);
  const adequateMean = mean(adequate);
  const difference = adequateMean - shortMean;
  if (Math.abs(difference) < MIN_MOOD_DIFFERENCE) return null;

  const lower = difference > 0;
  return {
    id: 'sleep-mood',
    kind: 'correlation',
    title: lower
      ? 'Shorter nights line up with lower mood'
      : 'Shorter nights line up with higher mood',
    detail:
      `On the ${short.length} days after under 6 hours of sleep, you rated your mood ` +
      `${round(shortMean, 1)} out of 5 on average. On the ${adequate.length} days after 7 hours ` +
      `or more, it averaged ${round(adequateMean, 1)}.`,
    sampleSize: short.length + adequate.length,
    windowDays,
    metric: 'sleep',
  };
}

function sleepStepsInsight(days: readonly DailyMetrics[], windowDays: number): Insight | null {
  const { short, adequate } = pairedBySleep(days, (day) => day.steps);
  if (short.length < MIN_GROUP_SIZE || adequate.length < MIN_GROUP_SIZE) return null;

  const shortMean = mean(short);
  const adequateMean = mean(adequate);
  const difference = adequateMean - shortMean;
  if (Math.abs(difference) < MIN_STEP_DIFFERENCE) return null;

  return {
    id: 'sleep-steps',
    kind: 'correlation',
    title:
      difference > 0 ? 'You move more after a longer night' : 'You move more after a shorter night',
    detail:
      `You averaged ${Math.round(shortMean).toLocaleString()} steps on the ${short.length} days ` +
      `after under 6 hours of sleep, and ${Math.round(adequateMean).toLocaleString()} on the ` +
      `${adequate.length} days after 7 hours or more.`,
    sampleSize: short.length + adequate.length,
    windowDays,
    metric: 'move',
  };
}

function hydrationConsistencyInsight(
  days: readonly DailyMetrics[],
  windowDays: number,
  waterTargetMl: number,
): Insight | null {
  const logged = days.filter((day) => day.waterMl > 0);
  if (logged.length < MIN_GROUP_SIZE * 2 || waterTargetMl <= 0) return null;

  const metTarget = logged.filter((day) => day.waterMl >= waterTargetMl).length;
  const percent = Math.round((metTarget / logged.length) * 100);

  return {
    id: 'hydration-consistency',
    kind: 'consistency',
    title: `You reached your water goal on ${percent}% of logged days`,
    detail:
      `${metTarget} of ${logged.length} days with water logged reached ` +
      `${waterTargetMl.toLocaleString()} ml.`,
    sampleSize: logged.length,
    windowDays,
    metric: 'water',
  };
}

function weightTrendInsight(days: readonly DailyMetrics[], windowDays: number): Insight | null {
  const points = days
    .map((day, index) => ({ index, weight: day.weightKg }))
    .filter((point): point is { index: number; weight: number } => isPresent(point.weight));

  if (points.length < MIN_GROUP_SIZE) return null;

  // Ordinary least squares slope, in kg per day.
  const meanIndex = mean(points.map((point) => point.index));
  const meanWeight = mean(points.map((point) => point.weight));
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.index - meanIndex) * (point.weight - meanWeight);
    denominator += (point.index - meanIndex) ** 2;
  }
  if (denominator === 0) return null;

  const perDay = numerator / denominator;
  const perWeek = perDay * 7;

  // Under 100 g a week is noise on a bathroom scale.
  if (Math.abs(perWeek) < 0.1) {
    return {
      id: 'weight-trend',
      kind: 'trend',
      title: 'Your weight has been steady',
      detail: `Across ${points.length} weigh-ins in the last ${windowDays} days, the trend is essentially flat.`,
      sampleSize: points.length,
      windowDays,
      metric: 'vitals',
    };
  }

  return {
    id: 'weight-trend',
    kind: 'trend',
    title: perWeek < 0 ? 'Your weight is trending down' : 'Your weight is trending up',
    detail:
      `Across ${points.length} weigh-ins in the last ${windowDays} days, the trend is about ` +
      `${round(Math.abs(perWeek), 2)} kg per week ${perWeek < 0 ? 'down' : 'up'}.`,
    sampleSize: points.length,
    windowDays,
    metric: 'vitals',
  };
}

function proteinInsight(
  days: readonly DailyMetrics[],
  windowDays: number,
  proteinTargetG: number | null,
): Insight | null {
  if (!proteinTargetG || proteinTargetG <= 0) return null;
  const logged = days.filter((day) => isPresent(day.proteinG) && (day.calories ?? 0) > 0);
  if (logged.length < MIN_GROUP_SIZE * 2) return null;

  const average = mean(logged.map((day) => day.proteinG as number));
  const percent = Math.round((average / proteinTargetG) * 100);
  if (percent >= 90 && percent <= 115) return null;

  return {
    id: 'protein-gap',
    kind: 'consistency',
    title:
      percent < 90
        ? 'Protein is running below your target'
        : 'Protein is running above your target',
    detail:
      `Across ${logged.length} days with food logged, you averaged ${Math.round(average)} g of ` +
      `protein against a ${proteinTargetG} g target.`,
    sampleSize: logged.length,
    windowDays,
    metric: 'energy',
  };
}

function activeDaysInsight(days: readonly DailyMetrics[], windowDays: number): Insight | null {
  if (days.length < MIN_GROUP_SIZE * 2) return null;
  const activeDays = days.filter((day) => day.activeMinutes > 0);
  if (activeDays.length === 0) return null;

  const percent = Math.round((activeDays.length / days.length) * 100);
  const averageOnActiveDays = mean(activeDays.map((day) => day.activeMinutes));

  return {
    id: 'activity-frequency',
    kind: 'consistency',
    title: `You logged activity on ${activeDays.length} of ${days.length} days`,
    detail:
      `That is ${percent}% of the window, averaging ${Math.round(averageOnActiveDays)} minutes ` +
      `on the days you did.`,
    sampleSize: days.length,
    windowDays,
    metric: 'move',
  };
}

export interface InsightContext {
  windowDays: number;
  waterTargetMl: number;
  proteinTargetG: number | null;
}

/**
 * Generate every insight that clears its evidence threshold.
 *
 * Returns an empty array when the data does not support any observation,
 * which the UI renders as an honest "not enough logged yet" state rather than
 * padding with something vague.
 */
export function generateInsights(
  days: readonly DailyMetrics[],
  context: InsightContext,
): Insight[] {
  const { windowDays, waterTargetMl, proteinTargetG } = context;

  const candidates = [
    sleepMoodInsight(days, windowDays),
    sleepStepsInsight(days, windowDays),
    weightTrendInsight(days, windowDays),
    proteinInsight(days, windowDays, proteinTargetG),
    hydrationConsistencyInsight(days, windowDays, waterTargetMl),
    activeDaysInsight(days, windowDays),
  ];

  return candidates.filter((insight): insight is Insight => insight !== null);
}
