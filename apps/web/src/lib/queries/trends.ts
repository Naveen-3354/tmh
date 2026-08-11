import 'server-only';

import {
  activityLogs,
  foodEntries,
  goals,
  moodLogs,
  profiles,
  sleepLogs,
  stepEntries,
  vitalReadings,
  waterLogs,
} from '@tmh/db';
import {
  addDays,
  computeStreak,
  dayKeyRange,
  generateInsights,
  toDayKey,
  zonedWallClockToUtc,
  type DailyMetrics,
  type DayKey,
  type Insight,
  type StreakSummary,
} from '@tmh/shared';
import { and, eq, gte, sql } from 'drizzle-orm';

import { queryAsUser } from '../auth';

export const TREND_WINDOWS = [7, 30, 90] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

export function parseTrendWindow(value: string | undefined): TrendWindow {
  const parsed = Number(value);
  return (TREND_WINDOWS as readonly number[]).includes(parsed) ? (parsed as TrendWindow) : 30;
}

export interface TrendsData {
  windowDays: TrendWindow;
  timezone: string;
  days: DailyMetrics[];
  insights: Insight[];
  streaks: {
    logging: StreakSummary;
    activity: StreakSummary;
  };
  targets: {
    waterMl: number;
    sleepMinutes: number;
    steps: number;
    calories: number | null;
    proteinG: number | null;
  };
}

/**
 * One row per day across the window, gap-filled.
 *
 * Days are bucketed by `occurred_at AT TIME ZONE <profile zone>`, so a log at
 * 00:30 local belongs to that local day rather than to whatever day it was in
 * UTC. Gap-filling matters: a missing day must render as an absent point, not
 * as a zero, or every chart would show phantom crashes on unlogged days.
 */
export async function getTrends(windowDays: TrendWindow): Promise<TrendsData> {
  return queryAsUser(async (db) => {
    const [profileRow] = await db.select({ timezone: profiles.timezone }).from(profiles).limit(1);
    const timezone = profileRow?.timezone ?? 'UTC';

    const today = toDayKey(new Date(), timezone);
    const from = addDays(today, -(windowDays - 1));
    const start = zonedWallClockToUtc(from, timezone);

    const [goalRow] = await db.select().from(goals).limit(1);

    // `AT TIME ZONE` converts the stored instant to local wall-clock time, so
    // the ::date cast lands on the user's calendar day.
    const localDay = (column: unknown) => sql`(${column} AT TIME ZONE ${timezone})::date`;

    const [water, food, activity, steps, sleep, mood, weight] = await Promise.all([
      db
        .select({
          day: sql<string>`${localDay(waterLogs.occurredAt)}::text`,
          total: sql<number>`sum(${waterLogs.amountMl})::int`,
        })
        .from(waterLogs)
        .where(gte(waterLogs.occurredAt, start))
        .groupBy(sql`1`),

      db
        .select({
          day: sql<string>`${localDay(foodEntries.occurredAt)}::text`,
          calories: sql<number>`sum(${foodEntries.calories})::int`,
          protein: sql<number>`sum(${foodEntries.proteinG})::float8`,
        })
        .from(foodEntries)
        .where(gte(foodEntries.occurredAt, start))
        .groupBy(sql`1`),

      db
        .select({
          day: sql<string>`${localDay(activityLogs.occurredAt)}::text`,
          minutes: sql<number>`sum(${activityLogs.durationMinutes})::int`,
        })
        .from(activityLogs)
        .where(gte(activityLogs.occurredAt, start))
        .groupBy(sql`1`),

      db
        .select({
          day: sql<string>`${stepEntries.day}::text`,
          total: sql<number>`sum(${stepEntries.steps})::int`,
        })
        .from(stepEntries)
        .where(gte(stepEntries.day, from))
        .groupBy(sql`1`),

      // Sleep belongs to the day you woke up on.
      db
        .select({
          day: sql<string>`${localDay(sleepLogs.wakeTime)}::text`,
          minutes: sql<number>`sum(${sleepLogs.durationMinutes})::int`,
        })
        .from(sleepLogs)
        .where(gte(sleepLogs.wakeTime, start))
        .groupBy(sql`1`),

      db
        .select({
          day: sql<string>`${localDay(moodLogs.occurredAt)}::text`,
          score: sql<number>`avg(${moodLogs.score})::float8`,
        })
        .from(moodLogs)
        .where(gte(moodLogs.occurredAt, start))
        .groupBy(sql`1`),

      // Last weigh-in of each day, not the average of several.
      db
        .select({
          day: sql<string>`${localDay(vitalReadings.occurredAt)}::text`,
          value: sql<number>`(array_agg(${vitalReadings.value} ORDER BY ${vitalReadings.occurredAt} DESC))[1]::float8`,
        })
        .from(vitalReadings)
        .where(and(eq(vitalReadings.type, 'weight'), gte(vitalReadings.occurredAt, start)))
        .groupBy(sql`1`),
    ]);

    const index = <T extends { day: string }>(rows: T[]) =>
      new Map(rows.map((row) => [row.day, row]));
    const waterBy = index(water);
    const foodBy = index(food);
    const activityBy = index(activity);
    const stepsBy = index(steps);
    const sleepBy = index(sleep);
    const moodBy = index(mood);
    const weightBy = index(weight);

    const days: DailyMetrics[] = dayKeyRange(from, today).map((day: DayKey) => ({
      day,
      sleepMinutes: sleepBy.get(day)?.minutes ?? null,
      mood: moodBy.get(day)?.score ?? null,
      steps: stepsBy.get(day)?.total ?? null,
      activeMinutes: activityBy.get(day)?.minutes ?? 0,
      waterMl: waterBy.get(day)?.total ?? 0,
      calories: foodBy.get(day)?.calories ?? null,
      proteinG: foodBy.get(day)?.protein ?? null,
      weightKg: weightBy.get(day)?.value ?? null,
    }));

    // "Logged anything at all" is the streak that matters; requiring a
    // specific metric would punish someone for a day they tracked differently.
    const loggedDays = days
      .filter(
        (entry) =>
          entry.waterMl > 0 ||
          entry.activeMinutes > 0 ||
          entry.calories !== null ||
          entry.mood !== null ||
          entry.sleepMinutes !== null ||
          entry.steps !== null,
      )
      .map((entry) => entry.day);

    const activeDays = days.filter((entry) => entry.activeMinutes > 0).map((entry) => entry.day);

    return {
      windowDays,
      timezone,
      days,
      insights: generateInsights(days, {
        windowDays,
        waterTargetMl: goalRow?.waterTargetMl ?? 2000,
        proteinTargetG: goalRow?.proteinTargetG ?? null,
      }),
      streaks: {
        logging: computeStreak(loggedDays, today),
        activity: computeStreak(activeDays, today),
      },
      targets: {
        waterMl: goalRow?.waterTargetMl ?? 2000,
        sleepMinutes: goalRow?.sleepTargetMinutes ?? 480,
        steps: goalRow?.stepsTarget ?? 8000,
        calories: goalRow?.calorieTarget ?? null,
        proteinG: goalRow?.proteinTargetG ?? null,
      },
    };
  });
}
