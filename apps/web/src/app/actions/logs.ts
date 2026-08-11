'use server';

import {
  activityLogs,
  foodEntries,
  medicationEvents,
  moodLogs,
  profiles,
  sleepLogs,
  stepEntries,
  vitalReadings,
  waterLogs,
} from '@tmh/db';
import {
  activityCaloriesBurned,
  findActivityType,
  formatVolume,
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
  type LogOutcome,
} from '@tmh/shared';
import { desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { queryAsUser } from '@/lib/auth';

/**
 * Server actions for every log type.
 *
 * Each one parses against the shared schema, writes under RLS, and returns the
 * created record's id. The MCP tools in Phase 4 call the same schemas, so a
 * value rejected here is rejected there.
 *
 * Failures are returned, never thrown: the client rolls its optimistic update
 * back and shows the message, rather than losing the entry to an error
 * boundary (RESEARCH.md D6).
 */

function fail(error: unknown, fallback: string): LogOutcome {
  // A Zod error carries a usable message; anything else must not leak.
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as z.ZodError).issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: issues[0]?.message ?? fallback, fieldErrors };
  }
  console.error(fallback, error);
  return { ok: false, error: fallback };
}

function revalidate(): void {
  revalidatePath('/today');
  revalidatePath('/history');
}

/** The profile's timezone, needed to decide which local day a write lands on. */
async function timezoneFor(db: Parameters<Parameters<typeof queryAsUser>[0]>[0]): Promise<string> {
  const [row] = await db.select({ timezone: profiles.timezone }).from(profiles).limit(1);
  return row?.timezone ?? 'UTC';
}

// ---------------------------------------------------------------------------

export async function logWater(input: unknown): Promise<LogOutcome> {
  const parsed = logWaterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not log that amount.');

  try {
    const id = await queryAsUser(async (db) => {
      const [row] = await db
        .insert(waterLogs)
        .values({
          userId: sql`auth.uid()`,
          occurredAt: parsed.data.occurredAt ?? new Date(),
          amountMl: parsed.data.amountMl,
          source: 'manual',
        })
        .returning({ id: waterLogs.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });

    revalidate();
    return {
      ok: true,
      id,
      kind: 'water',
      summary: `Logged ${formatVolume(parsed.data.amountMl, 'metric')} of water.`,
    };
  } catch (error) {
    return fail(error, 'Could not save that. Please try again.');
  }
}

export async function logActivity(input: unknown): Promise<LogOutcome> {
  const parsed = logActivitySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not log that activity.');
  const data = parsed.data;

  try {
    const result = await queryAsUser(async (db) => {
      // Burn is derived from the most recent weight, so the estimate tracks
      // the user rather than a value frozen at onboarding.
      const [latestWeight] = await db
        .select({ value: vitalReadings.value })
        .from(vitalReadings)
        .where(eq(vitalReadings.type, 'weight'))
        .orderBy(desc(vitalReadings.occurredAt))
        .limit(1);

      const weightKg = latestWeight?.value ?? 70;
      const caloriesBurned = activityCaloriesBurned({
        activitySlug: data.activitySlug,
        intensity: data.intensity,
        durationMinutes: data.durationMinutes,
        weightKg,
      });

      const [row] = await db
        .insert(activityLogs)
        .values({
          userId: sql`auth.uid()`,
          occurredAt: data.occurredAt ?? new Date(),
          activitySlug: data.activitySlug,
          intensity: data.intensity,
          durationMinutes: data.durationMinutes,
          distanceKm: data.distanceKm ?? null,
          caloriesBurned,
          notes: data.notes ?? null,
          source: 'manual',
        })
        .returning({ id: activityLogs.id });

      if (!row) throw new Error('insert returned no row');
      return { id: row.id, caloriesBurned };
    });

    revalidate();
    const label = findActivityType(data.activitySlug)?.label ?? data.activitySlug;
    return {
      ok: true,
      id: result.id,
      kind: 'activity',
      summary: `Logged ${data.durationMinutes} min of ${label.toLowerCase()} — about ${result.caloriesBurned} kcal.`,
    };
  } catch (error) {
    return fail(error, 'Could not save that activity.');
  }
}

export async function logSteps(input: unknown): Promise<LogOutcome> {
  const parsed = logStepsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not log those steps.');

  try {
    const id = await queryAsUser(async (db) => {
      const day = parsed.data.day ?? toDayKey(new Date(), await timezoneFor(db));
      // One manual total per day; logging again corrects it rather than adding.
      const [row] = await db
        .insert(stepEntries)
        .values({
          userId: sql`auth.uid()`,
          day,
          steps: parsed.data.steps,
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [stepEntries.userId, stepEntries.day, stepEntries.source],
          set: { steps: parsed.data.steps, updatedAt: new Date() },
        })
        .returning({ id: stepEntries.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });

    revalidate();
    return {
      ok: true,
      id,
      kind: 'steps',
      summary: `Recorded ${parsed.data.steps.toLocaleString()} steps.`,
    };
  } catch (error) {
    return fail(error, 'Could not save those steps.');
  }
}

export async function logMeal(input: unknown): Promise<LogOutcome> {
  const parsed = logMealSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not log that food.');
  const data = parsed.data;

  try {
    const id = await queryAsUser(async (db) => {
      const [row] = await db
        .insert(foodEntries)
        .values({
          userId: sql`auth.uid()`,
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
          source: 'manual',
        })
        .returning({ id: foodEntries.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });

    revalidate();
    return {
      ok: true,
      id,
      kind: 'meal',
      summary: `Logged ${data.name} — ${Math.round(data.calories)} kcal.`,
    };
  } catch (error) {
    return fail(error, 'Could not save that food.');
  }
}

export async function logSleep(input: unknown): Promise<LogOutcome> {
  const parsed = logSleepSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not log that sleep.');
  const data = parsed.data;

  const durationMinutes = Math.round((data.wakeTime.getTime() - data.bedtime.getTime()) / 60_000);

  try {
    const id = await queryAsUser(async (db) => {
      const [row] = await db
        .insert(sleepLogs)
        .values({
          userId: sql`auth.uid()`,
          bedtime: data.bedtime,
          wakeTime: data.wakeTime,
          durationMinutes,
          quality: data.quality ?? null,
          notes: data.notes ?? null,
          source: 'manual',
        })
        .returning({ id: sleepLogs.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });

    revalidate();
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return {
      ok: true,
      id,
      kind: 'sleep',
      summary: `Logged ${hours}h ${minutes}m of sleep.`,
    };
  } catch (error) {
    return fail(error, 'Could not save that sleep entry.');
  }
}

export async function logVital(input: unknown): Promise<LogOutcome> {
  const parsed = logVitalSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not log that reading.');
  const data = parsed.data;

  try {
    const id = await queryAsUser(async (db) => {
      const [row] = await db
        .insert(vitalReadings)
        .values({
          userId: sql`auth.uid()`,
          occurredAt: data.occurredAt ?? new Date(),
          type: data.type,
          value: data.value,
          secondaryValue: data.secondaryValue ?? null,
          notes: data.notes ?? null,
          source: 'manual',
        })
        .returning({ id: vitalReadings.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });

    revalidate();
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
  } catch (error) {
    return fail(error, 'Could not save that reading.');
  }
}

export async function logMood(input: unknown): Promise<LogOutcome> {
  const parsed = logMoodSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not log that.');
  const data = parsed.data;

  try {
    const id = await queryAsUser(async (db) => {
      const [row] = await db
        .insert(moodLogs)
        .values({
          userId: sql`auth.uid()`,
          occurredAt: data.occurredAt ?? new Date(),
          score: data.score,
          note: data.note ?? null,
          tags: data.tags,
          source: 'manual',
        })
        .returning({ id: moodLogs.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });

    revalidate();
    return {
      ok: true,
      id,
      kind: 'mood',
      summary: `Logged mood: ${MOOD_LABELS[data.score] ?? data.score}.`,
    };
  } catch (error) {
    return fail(error, 'Could not save that.');
  }
}

export async function logMedication(input: unknown): Promise<LogOutcome> {
  const parsed = logMedicationSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error, 'Could not record that dose.');
  const data = parsed.data;

  try {
    const id = await queryAsUser(async (db) => {
      const scheduledFor = data.scheduledFor ?? new Date();
      // Answering the same dose twice updates it rather than duplicating.
      const [row] = await db
        .insert(medicationEvents)
        .values({
          userId: sql`auth.uid()`,
          medicationId: data.medicationId,
          scheduledFor,
          status: data.status,
          recordedAt: new Date(),
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [medicationEvents.medicationId, medicationEvents.scheduledFor],
          set: { status: data.status, recordedAt: new Date(), updatedAt: new Date() },
        })
        .returning({ id: medicationEvents.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });

    revalidate();
    return {
      ok: true,
      id,
      kind: 'medication',
      summary: data.status === 'taken' ? 'Marked as taken.' : 'Marked as skipped.',
    };
  } catch (error) {
    return fail(error, 'Could not record that dose.');
  }
}

/** Removes a log entry the user just created. Used by the undo affordance. */
export async function deleteLogEntry(kind: string, id: string): Promise<LogOutcome> {
  const tables = {
    water: waterLogs,
    activity: activityLogs,
    meal: foodEntries,
    sleep: sleepLogs,
    vital: vitalReadings,
    mood: moodLogs,
  } as const;

  const table = tables[kind as keyof typeof tables];
  if (!table) return { ok: false, error: 'Unknown entry type.' };

  try {
    await queryAsUser(async (db) => {
      // RLS makes this safe without an ownership check: another user's id
      // simply matches no rows.
      await db.delete(table).where(eq(table.id, id));
    });
    revalidate();
    return { ok: true, id, kind, summary: 'Removed.' };
  } catch (error) {
    return fail(error, 'Could not remove that entry.');
  }
}
