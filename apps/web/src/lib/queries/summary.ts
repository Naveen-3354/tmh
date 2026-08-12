import 'server-only';

import {
  activityLogs,
  foodEntries,
  goals,
  moodLogs,
  profiles,
  sleepLogs,
  stepEntries,
  waterLogs,
} from '@tmh/db';
import { dayRangeUtc, toDayKey, type DayKey } from '@tmh/shared';
import { and, desc, gte, lt, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { onScoped, type UserScopedDatabase } from '../auth';

export interface DailySummary {
  dayKey: DayKey;
  timezone: string;
  water: { totalMl: number; targetMl: number };
  energy: { consumedKcal: number; burnedKcal: number; targetKcal: number | null };
  move: { activeMinutes: number; targetMinutes: number; steps: number; stepsTarget: number };
  sleep: { minutes: number; quality: number | null } | null;
  mood: { score: number; note: string | null } | null;
  macros: { proteinG: number; carbsG: number; fatG: number };
  isEmpty: boolean;
}

/**
 * Everything the dashboard needs for one local day, in a single round trip.
 *
 * The day boundary is resolved in the profile's timezone, so a log at 00:30
 * local belongs to that local day regardless of where UTC happens to be — and
 * a DST day is 23 or 25 hours wide rather than a hard-coded 24.
 */
export async function getDailySummary(
  requestedDay?: DayKey,
  scoped?: UserScopedDatabase,
): Promise<DailySummary> {
  return onScoped(scoped, async (db) => {
    const [profileRow] = await db.select({ timezone: profiles.timezone }).from(profiles).limit(1);
    const timezone = profileRow?.timezone ?? 'UTC';

    const dayKey = requestedDay ?? toDayKey(new Date(), timezone);
    const { start, end } = dayRangeUtc(dayKey, timezone);

    const [goalRow] = await db.select().from(goals).limit(1);

    const inDay = (column: AnyPgColumn) => and(gte(column, start), lt(column, end));

    const [waterRow, foodRow, activityRow, stepRow, sleepRow, moodRow] = await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${waterLogs.amountMl}), 0)::int` })
        .from(waterLogs)
        .where(inDay(waterLogs.occurredAt)),

      db
        .select({
          calories: sql<number>`coalesce(sum(${foodEntries.calories}), 0)::int`,
          protein: sql<number>`coalesce(sum(${foodEntries.proteinG}), 0)::float8`,
          carbs: sql<number>`coalesce(sum(${foodEntries.carbsG}), 0)::float8`,
          fat: sql<number>`coalesce(sum(${foodEntries.fatG}), 0)::float8`,
        })
        .from(foodEntries)
        .where(inDay(foodEntries.occurredAt)),

      db
        .select({
          minutes: sql<number>`coalesce(sum(${activityLogs.durationMinutes}), 0)::int`,
          burned: sql<number>`coalesce(sum(${activityLogs.caloriesBurned}), 0)::int`,
        })
        .from(activityLogs)
        .where(inDay(activityLogs.occurredAt)),

      db
        .select({ steps: sql<number>`coalesce(sum(${stepEntries.steps}), 0)::int` })
        .from(stepEntries)
        .where(sql`${stepEntries.day} = ${dayKey}::date`),

      // Sleep is attributed to the day you woke up on.
      db
        .select({ minutes: sleepLogs.durationMinutes, quality: sleepLogs.quality })
        .from(sleepLogs)
        .where(inDay(sleepLogs.wakeTime))
        .orderBy(desc(sleepLogs.wakeTime))
        .limit(1),

      db
        .select({ score: moodLogs.score, note: moodLogs.note })
        .from(moodLogs)
        .where(inDay(moodLogs.occurredAt))
        .orderBy(desc(moodLogs.occurredAt))
        .limit(1),
    ]);

    const water = waterRow[0]?.total ?? 0;
    const consumed = foodRow[0]?.calories ?? 0;
    const burned = activityRow[0]?.burned ?? 0;
    const activeMinutes = activityRow[0]?.minutes ?? 0;
    const steps = stepRow[0]?.steps ?? 0;
    const sleep = sleepRow[0] ?? null;
    const mood = moodRow[0] ?? null;

    return {
      dayKey,
      timezone,
      water: { totalMl: water, targetMl: goalRow?.waterTargetMl ?? 2000 },
      energy: {
        consumedKcal: consumed,
        burnedKcal: burned,
        targetKcal: goalRow?.calorieTarget ?? null,
      },
      move: {
        activeMinutes,
        targetMinutes: goalRow?.activeMinutesTarget ?? 30,
        steps,
        stepsTarget: goalRow?.stepsTarget ?? 8000,
      },
      sleep: sleep ? { minutes: sleep.minutes, quality: sleep.quality } : null,
      mood: mood ? { score: mood.score, note: mood.note } : null,
      macros: {
        proteinG: Math.round(foodRow[0]?.protein ?? 0),
        carbsG: Math.round(foodRow[0]?.carbs ?? 0),
        fatG: Math.round(foodRow[0]?.fat ?? 0),
      },
      isEmpty:
        water === 0 && consumed === 0 && activeMinutes === 0 && steps === 0 && !sleep && !mood,
    };
  });
}
