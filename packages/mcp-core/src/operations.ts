/**
 * The canonical write and read operations.
 *
 * Both surfaces call these: the web app's server actions and the MCP tools.
 * That is what makes "the MCP server has the same rules as the app" a
 * structural fact rather than a promise — there is one implementation, one set
 * of Zod schemas guarding it, and one RLS-scoped path to the database.
 *
 * Every function takes an explicit `userId` and runs inside withUserContext,
 * so Postgres enforces ownership regardless of which surface called.
 */

import {
  activityLogs,
  foodEntries,
  goals,
  medicationEvents,
  medications,
  moodLogs,
  profiles,
  sleepLogs,
  stepEntries,
  vitalReadings,
  waterLogs,
  withUserContext,
} from '@tmh/db';
import {
  activityCaloriesBurned,
  dayRangeUtc,
  findActivityType,
  logActivitySchema,
  logMealSchema,
  logMedicationSchema,
  logMoodSchema,
  logSleepSchema,
  logStepsSchema,
  logVitalSchema,
  logWaterSchema,
  MOOD_LABELS,
  toDayKey,
  VITAL_RANGES,
  type DayKey,
  type EntrySource,
  type LogResult,
} from '@tmh/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';

/** Thrown for anything a caller could reasonably fix. Never wraps an internal error. */
export class OperationError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

/**
 * Validate against a shared schema, or throw an OperationError.
 *
 * Generic over the schema so the parsed type is inferred — the caller never
 * restates the shape, which is what keeps these operations honestly tied to
 * the schemas rather than to a hand-written copy of them.
 */
function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  throw new OperationError(
    result.error.issues[0]?.message ?? 'That input could not be read.',
    fieldErrors,
  );
}

/** The database fills user_id from the session claim; callers never supply it. */
const OWNER = sql`auth.uid()`;

async function profileTimezone(userId: string): Promise<string> {
  return withUserContext(userId, async (db) => {
    const [row] = await db.select({ timezone: profiles.timezone }).from(profiles).limit(1);
    return row?.timezone ?? 'UTC';
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function logWater(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logWaterSchema, input);

  const id = await withUserContext(userId, async (db) => {
    const [row] = await db
      .insert(waterLogs)
      .values({
        userId: OWNER,
        occurredAt: data.occurredAt ?? new Date(),
        amountMl: data.amountMl,
        source,
      })
      .returning({ id: waterLogs.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  });

  return { ok: true, id, kind: 'water', summary: `Logged ${data.amountMl} ml of water.` };
}

export async function logActivity(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logActivitySchema, input);

  const result = await withUserContext(userId, async (db) => {
    // Burn tracks the most recent weight rather than a value frozen at signup.
    const [latestWeight] = await db
      .select({ value: vitalReadings.value })
      .from(vitalReadings)
      .where(eq(vitalReadings.type, 'weight'))
      .orderBy(desc(vitalReadings.occurredAt))
      .limit(1);

    const caloriesBurned = activityCaloriesBurned({
      activitySlug: data.activitySlug,
      intensity: data.intensity,
      durationMinutes: data.durationMinutes,
      weightKg: latestWeight?.value ?? 70,
    });

    const [row] = await db
      .insert(activityLogs)
      .values({
        userId: OWNER,
        occurredAt: data.occurredAt ?? new Date(),
        activitySlug: data.activitySlug,
        intensity: data.intensity,
        durationMinutes: data.durationMinutes,
        distanceKm: data.distanceKm ?? null,
        caloriesBurned,
        notes: data.notes ?? null,
        source,
      })
      .returning({ id: activityLogs.id });
    if (!row) throw new Error('insert returned no row');
    return { id: row.id, caloriesBurned };
  });

  const label = findActivityType(data.activitySlug)?.label ?? data.activitySlug;
  return {
    ok: true,
    id: result.id,
    kind: 'activity',
    summary: `Logged ${data.durationMinutes} min of ${label.toLowerCase()} — about ${result.caloriesBurned} kcal.`,
  };
}

export async function logSteps(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logStepsSchema, input);
  const day = data.day ?? toDayKey(new Date(), await profileTimezone(userId));

  const id = await withUserContext(userId, async (db) => {
    const [row] = await db
      .insert(stepEntries)
      .values({ userId: OWNER, day, steps: data.steps, source })
      .onConflictDoUpdate({
        target: [stepEntries.userId, stepEntries.day, stepEntries.source],
        set: { steps: data.steps, updatedAt: new Date() },
      })
      .returning({ id: stepEntries.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  });

  return {
    ok: true,
    id,
    kind: 'steps',
    summary: `Recorded ${data.steps.toLocaleString()} steps for ${day}.`,
  };
}

export async function logMeal(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logMealSchema, input);

  const id = await withUserContext(userId, async (db) => {
    const [row] = await db
      .insert(foodEntries)
      .values({
        userId: OWNER,
        occurredAt: data.occurredAt ?? new Date(),
        mealType: data.mealType,
        name: data.name,
        brand: data.brand ?? null,
        foodSource: data.foodSource,
        externalId: data.externalId ?? null,
        barcode: data.barcode ?? null,
        quantity: data.quantity,
        unit: data.unit,
        calories: Math.round(data.calories),
        proteinG: data.proteinG,
        carbsG: data.carbsG,
        fatG: data.fatG,
        fiberG: data.fiberG,
        sugarG: data.sugarG,
        sodiumMg: data.sodiumMg,
        source,
      })
      .returning({ id: foodEntries.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  });

  return {
    ok: true,
    id,
    kind: 'meal',
    summary: `Logged ${data.name} to ${data.mealType} — ${Math.round(data.calories)} kcal.`,
  };
}

export async function logSleep(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logSleepSchema, input);

  const durationMinutes = Math.round((data.wakeTime.getTime() - data.bedtime.getTime()) / 60_000);

  const id = await withUserContext(userId, async (db) => {
    const [row] = await db
      .insert(sleepLogs)
      .values({
        userId: OWNER,
        bedtime: data.bedtime,
        wakeTime: data.wakeTime,
        durationMinutes,
        quality: data.quality ?? null,
        notes: data.notes ?? null,
        source,
      })
      .returning({ id: sleepLogs.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  });

  return {
    ok: true,
    id,
    kind: 'sleep',
    summary: `Logged ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m of sleep.`,
  };
}

export async function logVital(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logVitalSchema, input);

  const id = await withUserContext(userId, async (db) => {
    const [row] = await db
      .insert(vitalReadings)
      .values({
        userId: OWNER,
        occurredAt: data.occurredAt ?? new Date(),
        type: data.type,
        value: data.value,
        secondaryValue: data.secondaryValue ?? null,
        notes: data.notes ?? null,
        source,
      })
      .returning({ id: vitalReadings.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  });

  const range = VITAL_RANGES[data.type];
  const reading =
    data.type === 'blood_pressure'
      ? `${data.value}/${data.secondaryValue} ${range.unit}`
      : `${data.value} ${range.unit}`;

  return {
    ok: true,
    id,
    kind: 'vital',
    summary: `Logged ${range.label.toLowerCase()}: ${reading}.`,
  };
}

export async function logMood(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logMoodSchema, input);

  const id = await withUserContext(userId, async (db) => {
    const [row] = await db
      .insert(moodLogs)
      .values({
        userId: OWNER,
        occurredAt: data.occurredAt ?? new Date(),
        score: data.score,
        note: data.note ?? null,
        tags: data.tags,
        source,
      })
      .returning({ id: moodLogs.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  });

  return {
    ok: true,
    id,
    kind: 'mood',
    summary: `Logged mood: ${MOOD_LABELS[data.score] ?? data.score}.`,
  };
}

export async function logMedicationTaken(
  userId: string,
  input: unknown,
  source: EntrySource,
): Promise<LogResult> {
  const data = parseOrThrow(logMedicationSchema, input);

  const id = await withUserContext(userId, async (db) => {
    // RLS means an id belonging to someone else simply matches nothing.
    const [medication] = await db
      .select({ id: medications.id, name: medications.name })
      .from(medications)
      .where(eq(medications.id, data.medicationId))
      .limit(1);

    if (!medication) {
      throw new OperationError('No medication with that id. Call list_medications first.');
    }

    const [row] = await db
      .insert(medicationEvents)
      .values({
        userId: OWNER,
        medicationId: data.medicationId,
        scheduledFor: data.scheduledFor ?? new Date(),
        status: data.status,
        recordedAt: new Date(),
        source,
      })
      .onConflictDoUpdate({
        target: [medicationEvents.medicationId, medicationEvents.scheduledFor],
        set: { status: data.status, recordedAt: new Date(), updatedAt: new Date() },
      })
      .returning({ id: medicationEvents.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  });

  return {
    ok: true,
    id,
    kind: 'medication',
    summary: data.status === 'taken' ? 'Marked as taken.' : 'Marked as skipped.',
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ProfileSummary {
  displayName: string | null;
  timezone: string;
  unitSystem: 'metric' | 'imperial';
  activityLevel: string;
  weightGoal: string;
  targets: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    waterMl: number;
    sleepMinutes: number;
    steps: number;
    activeMinutes: number;
  };
}

export async function getProfileSummary(userId: string): Promise<ProfileSummary> {
  return withUserContext(userId, async (db) => {
    const [profile] = await db.select().from(profiles).limit(1);
    const [goalRow] = await db.select().from(goals).limit(1);
    if (!profile) throw new OperationError('No profile found for this token.');

    return {
      displayName: profile.displayName,
      timezone: profile.timezone,
      unitSystem: profile.unitSystem,
      activityLevel: profile.activityLevel,
      weightGoal: profile.weightGoal,
      targets: {
        calories: goalRow?.calorieTarget ?? null,
        proteinG: goalRow?.proteinTargetG ?? null,
        carbsG: goalRow?.carbsTargetG ?? null,
        fatG: goalRow?.fatTargetG ?? null,
        waterMl: goalRow?.waterTargetMl ?? 2000,
        sleepMinutes: goalRow?.sleepTargetMinutes ?? 480,
        steps: goalRow?.stepsTarget ?? 8000,
        activeMinutes: goalRow?.activeMinutesTarget ?? 30,
      },
    };
  });
}

export interface DaySummary {
  date: DayKey;
  timezone: string;
  water: { totalMl: number; targetMl: number };
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number; entries: number };
  activity: { activeMinutes: number; caloriesBurned: number; steps: number; sessions: number };
  sleep: { minutes: number; quality: number | null } | null;
  mood: { score: number; note: string | null; tags: string[] } | null;
  medications: { taken: number; skipped: number };
}

export async function getDaySummary(userId: string, date?: string): Promise<DaySummary> {
  const timezone = await profileTimezone(userId);
  const dayKey = date ?? toDayKey(new Date(), timezone);
  const { start, end } = dayRangeUtc(dayKey, timezone);

  return withUserContext(userId, async (db) => {
    const [goalRow] = await db.select().from(goals).limit(1);

    const [water, food, activity, steps, sleep, mood, meds] = await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${waterLogs.amountMl}), 0)::int` })
        .from(waterLogs)
        .where(and(gte(waterLogs.occurredAt, start), lt(waterLogs.occurredAt, end))),
      db
        .select({
          calories: sql<number>`coalesce(sum(${foodEntries.calories}), 0)::int`,
          protein: sql<number>`coalesce(sum(${foodEntries.proteinG}), 0)::float8`,
          carbs: sql<number>`coalesce(sum(${foodEntries.carbsG}), 0)::float8`,
          fat: sql<number>`coalesce(sum(${foodEntries.fatG}), 0)::float8`,
          entries: sql<number>`count(*)::int`,
        })
        .from(foodEntries)
        .where(and(gte(foodEntries.occurredAt, start), lt(foodEntries.occurredAt, end))),
      db
        .select({
          minutes: sql<number>`coalesce(sum(${activityLogs.durationMinutes}), 0)::int`,
          burned: sql<number>`coalesce(sum(${activityLogs.caloriesBurned}), 0)::int`,
          sessions: sql<number>`count(*)::int`,
        })
        .from(activityLogs)
        .where(and(gte(activityLogs.occurredAt, start), lt(activityLogs.occurredAt, end))),
      db
        .select({ total: sql<number>`coalesce(sum(${stepEntries.steps}), 0)::int` })
        .from(stepEntries)
        .where(sql`${stepEntries.day} = ${dayKey}::date`),
      db
        .select({ minutes: sleepLogs.durationMinutes, quality: sleepLogs.quality })
        .from(sleepLogs)
        .where(and(gte(sleepLogs.wakeTime, start), lt(sleepLogs.wakeTime, end)))
        .orderBy(desc(sleepLogs.wakeTime))
        .limit(1),
      db
        .select({ score: moodLogs.score, note: moodLogs.note, tags: moodLogs.tags })
        .from(moodLogs)
        .where(and(gte(moodLogs.occurredAt, start), lt(moodLogs.occurredAt, end)))
        .orderBy(desc(moodLogs.occurredAt))
        .limit(1),
      db
        .select({ status: medicationEvents.status, count: sql<number>`count(*)::int` })
        .from(medicationEvents)
        .where(
          and(gte(medicationEvents.scheduledFor, start), lt(medicationEvents.scheduledFor, end)),
        )
        .groupBy(medicationEvents.status),
    ]);

    const sleepRow = sleep[0] ?? null;
    const moodRow = mood[0] ?? null;

    return {
      date: dayKey,
      timezone,
      water: { totalMl: water[0]?.total ?? 0, targetMl: goalRow?.waterTargetMl ?? 2000 },
      nutrition: {
        calories: food[0]?.calories ?? 0,
        proteinG: Math.round(food[0]?.protein ?? 0),
        carbsG: Math.round(food[0]?.carbs ?? 0),
        fatG: Math.round(food[0]?.fat ?? 0),
        entries: food[0]?.entries ?? 0,
      },
      activity: {
        activeMinutes: activity[0]?.minutes ?? 0,
        caloriesBurned: activity[0]?.burned ?? 0,
        steps: steps[0]?.total ?? 0,
        sessions: activity[0]?.sessions ?? 0,
      },
      sleep: sleepRow ? { minutes: sleepRow.minutes, quality: sleepRow.quality } : null,
      mood: moodRow ? { score: moodRow.score, note: moodRow.note, tags: moodRow.tags } : null,
      medications: {
        taken: meds.find((row) => row.status === 'taken')?.count ?? 0,
        skipped: meds.find((row) => row.status === 'skipped')?.count ?? 0,
      },
    };
  });
}

export const TREND_METRICS = [
  'steps',
  'sleep',
  'calories',
  'protein',
  'water',
  'mood',
  'weight',
  'active_minutes',
] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

export interface TrendSeries {
  metric: TrendMetric;
  unit: string;
  rangeDays: number;
  timezone: string;
  /** One entry per day that has data. Missing days are simply absent. */
  points: { date: string; value: number }[];
  summary: { average: number | null; min: number | null; max: number | null; daysLogged: number };
}

export async function getTrendSeries(
  userId: string,
  metric: TrendMetric,
  rangeDays: number,
): Promise<TrendSeries> {
  const timezone = await profileTimezone(userId);
  const today = toDayKey(new Date(), timezone);
  const { start } = dayRangeUtc(today, timezone);
  const from = new Date(start.getTime() - (rangeDays - 1) * 86_400_000);

  const points = await withUserContext(userId, async (db) => {
    const localDay = (column: unknown) => sql`(${column} AT TIME ZONE ${timezone})::date`;

    switch (metric) {
      case 'steps':
        return db
          .select({
            date: sql<string>`${stepEntries.day}::text`,
            value: sql<number>`sum(${stepEntries.steps})::float8`,
          })
          .from(stepEntries)
          .where(gte(stepEntries.day, toDayKey(from, timezone)))
          .groupBy(sql`1`)
          .orderBy(sql`1`);
      case 'sleep':
        return db
          .select({
            date: sql<string>`${localDay(sleepLogs.wakeTime)}::text`,
            value: sql<number>`(sum(${sleepLogs.durationMinutes}) / 60.0)::float8`,
          })
          .from(sleepLogs)
          .where(gte(sleepLogs.wakeTime, from))
          .groupBy(sql`1`)
          .orderBy(sql`1`);
      case 'calories':
      case 'protein':
        return db
          .select({
            date: sql<string>`${localDay(foodEntries.occurredAt)}::text`,
            value:
              metric === 'calories'
                ? sql<number>`sum(${foodEntries.calories})::float8`
                : sql<number>`sum(${foodEntries.proteinG})::float8`,
          })
          .from(foodEntries)
          .where(gte(foodEntries.occurredAt, from))
          .groupBy(sql`1`)
          .orderBy(sql`1`);
      case 'water':
        return db
          .select({
            date: sql<string>`${localDay(waterLogs.occurredAt)}::text`,
            value: sql<number>`sum(${waterLogs.amountMl})::float8`,
          })
          .from(waterLogs)
          .where(gte(waterLogs.occurredAt, from))
          .groupBy(sql`1`)
          .orderBy(sql`1`);
      case 'mood':
        return db
          .select({
            date: sql<string>`${localDay(moodLogs.occurredAt)}::text`,
            value: sql<number>`avg(${moodLogs.score})::float8`,
          })
          .from(moodLogs)
          .where(gte(moodLogs.occurredAt, from))
          .groupBy(sql`1`)
          .orderBy(sql`1`);
      case 'weight':
        return db
          .select({
            date: sql<string>`${localDay(vitalReadings.occurredAt)}::text`,
            value: sql<number>`(array_agg(${vitalReadings.value} ORDER BY ${vitalReadings.occurredAt} DESC))[1]::float8`,
          })
          .from(vitalReadings)
          .where(and(eq(vitalReadings.type, 'weight'), gte(vitalReadings.occurredAt, from)))
          .groupBy(sql`1`)
          .orderBy(sql`1`);
      case 'active_minutes':
        return db
          .select({
            date: sql<string>`${localDay(activityLogs.occurredAt)}::text`,
            value: sql<number>`sum(${activityLogs.durationMinutes})::float8`,
          })
          .from(activityLogs)
          .where(gte(activityLogs.occurredAt, from))
          .groupBy(sql`1`)
          .orderBy(sql`1`);
    }
  });

  const values = points.map((point) => point.value);
  const units: Record<TrendMetric, string> = {
    steps: 'steps',
    sleep: 'hours',
    calories: 'kcal',
    protein: 'g',
    water: 'ml',
    mood: '1-5',
    weight: 'kg',
    active_minutes: 'minutes',
  };

  return {
    metric,
    unit: units[metric],
    rangeDays,
    timezone,
    points: points.map((point) => ({
      date: point.date,
      value: Math.round(point.value * 100) / 100,
    })),
    summary: {
      average:
        values.length > 0
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
          : null,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      daysLogged: values.length,
    },
  };
}

export async function listMedications(userId: string) {
  return withUserContext(userId, async (db) =>
    db
      .select({
        id: medications.id,
        name: medications.name,
        dosage: medications.dosage,
        scheduleTimes: medications.scheduleTimes,
        active: medications.active,
      })
      .from(medications)
      .orderBy(medications.name),
  );
}

export const LOG_TYPES = ['activity', 'food', 'sleep', 'water', 'vitals', 'mood', 'steps'] as const;
export type LogType = (typeof LOG_TYPES)[number];

/** Raw rows for a log type in a date range, for the `health://logs/...` resource. */
export async function listLogs(
  userId: string,
  type: LogType,
  fromDay: string,
  toDay: string,
): Promise<Record<string, unknown>[]> {
  const timezone = await profileTimezone(userId);
  const start = dayRangeUtc(fromDay, timezone).start;
  const end = dayRangeUtc(toDay, timezone).end;

  return withUserContext(userId, async (db) => {
    switch (type) {
      case 'activity':
        return db
          .select()
          .from(activityLogs)
          .where(and(gte(activityLogs.occurredAt, start), lt(activityLogs.occurredAt, end)))
          .orderBy(activityLogs.occurredAt);
      case 'food':
        return db
          .select()
          .from(foodEntries)
          .where(and(gte(foodEntries.occurredAt, start), lt(foodEntries.occurredAt, end)))
          .orderBy(foodEntries.occurredAt);
      case 'sleep':
        return db
          .select()
          .from(sleepLogs)
          .where(and(gte(sleepLogs.wakeTime, start), lt(sleepLogs.wakeTime, end)))
          .orderBy(sleepLogs.wakeTime);
      case 'water':
        return db
          .select()
          .from(waterLogs)
          .where(and(gte(waterLogs.occurredAt, start), lt(waterLogs.occurredAt, end)))
          .orderBy(waterLogs.occurredAt);
      case 'vitals':
        return db
          .select()
          .from(vitalReadings)
          .where(and(gte(vitalReadings.occurredAt, start), lt(vitalReadings.occurredAt, end)))
          .orderBy(vitalReadings.occurredAt);
      case 'mood':
        return db
          .select()
          .from(moodLogs)
          .where(and(gte(moodLogs.occurredAt, start), lt(moodLogs.occurredAt, end)))
          .orderBy(moodLogs.occurredAt);
      case 'steps':
        return db
          .select()
          .from(stepEntries)
          .where(and(gte(stepEntries.day, fromDay), lt(stepEntries.day, toDay)))
          .orderBy(stepEntries.day);
    }
  });
}
