'use server';

import {
  activityLogs,
  foodEntries,
  medicationEvents,
  medications,
  moodLogs,
  sleepLogs,
  stepEntries,
  vitalReadings,
  waterLogs,
  withElevatedContext,
} from '@tmh/db';
import {
  csvDate,
  csvNumber,
  logActivitySchema,
  logMealSchema,
  logMoodSchema,
  logSleepSchema,
  logVitalSchema,
  logWaterSchema,
  parseCsv,
  type CsvRow,
  type ImportableType,
  IMPORTABLE_TYPES,
} from '@tmh/shared';
import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { queryAsUser, requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * CSV import — the universal fallback for every data type (brief §3).
 *
 * Rows are validated one at a time against the same schemas the UI and the
 * MCP tools use. A bad row is reported with its line number and skipped; it
 * never aborts the rest of the file, because a 400-row export with two typos
 * should still import 398 rows.
 */

export interface ImportState {
  status: 'idle' | 'done' | 'error';
  imported?: number;
  skipped?: { line: number; reason: string }[];
  message?: string;
}

const MAX_ROWS = 5000;

function firstIssue(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { message: string; path: (string | number)[] }[] }).issues;
    const issue = issues[0];
    if (issue) return `${issue.path.join('.') || 'row'}: ${issue.message}`;
  }
  return 'could not be read';
}

/** Map a CSV row to the payload each schema expects. */
function toPayload(type: ImportableType, row: CsvRow): unknown {
  switch (type) {
    case 'water':
      return {
        amountMl: csvNumber(row.amount_ml ?? row.amount ?? row.ml),
        occurredAt: csvDate(row.occurred_at ?? row.date ?? row.time),
      };
    case 'activity':
      return {
        activitySlug: row.activity_slug ?? row.activity ?? row.type ?? 'other',
        intensity: row.intensity || 'moderate',
        durationMinutes: csvNumber(row.duration_minutes ?? row.duration ?? row.minutes),
        distanceKm: csvNumber(row.distance_km ?? row.distance),
        notes: row.notes || undefined,
        occurredAt: csvDate(row.occurred_at ?? row.date),
      };
    case 'food':
      return {
        mealType: row.meal_type || 'snack',
        name: row.name ?? row.food ?? '',
        brand: row.brand || undefined,
        calories: csvNumber(row.calories ?? row.kcal),
        proteinG: csvNumber(row.protein_g ?? row.protein) ?? 0,
        carbsG: csvNumber(row.carbs_g ?? row.carbs) ?? 0,
        fatG: csvNumber(row.fat_g ?? row.fat) ?? 0,
        fiberG: csvNumber(row.fiber_g ?? row.fiber) ?? 0,
        sugarG: csvNumber(row.sugar_g ?? row.sugar) ?? 0,
        sodiumMg: csvNumber(row.sodium_mg ?? row.sodium) ?? 0,
        quantity: csvNumber(row.quantity) ?? 1,
        unit: row.unit || 'serving',
        occurredAt: csvDate(row.occurred_at ?? row.date),
      };
    case 'sleep':
      return {
        bedtime: csvDate(row.bedtime ?? row.start),
        wakeTime: csvDate(row.wake_time ?? row.end),
        quality: csvNumber(row.quality),
        notes: row.notes || undefined,
      };
    case 'vitals':
      return {
        type: row.type ?? row.vital_type ?? 'weight',
        value: csvNumber(row.value),
        secondaryValue: csvNumber(row.secondary_value ?? row.diastolic),
        notes: row.notes || undefined,
        occurredAt: csvDate(row.occurred_at ?? row.date),
      };
    case 'mood':
      return {
        score: csvNumber(row.score ?? row.mood),
        note: row.note || undefined,
        tags: row.tags ? row.tags.split('|').filter(Boolean) : [],
        occurredAt: csvDate(row.occurred_at ?? row.date),
      };
  }
}

export async function importCsv(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const type = formData.get('type');
  const file = formData.get('file');

  if (typeof type !== 'string' || !(IMPORTABLE_TYPES as readonly string[]).includes(type)) {
    return { status: 'error', message: 'Pick what kind of data this file contains.' };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a CSV file to import.' };
  }
  if (file.size > 5_000_000) {
    return { status: 'error', message: 'That file is larger than 5 MB. Split it and try again.' };
  }

  const rows = parseCsv(await file.text());
  if (rows.length === 0) {
    return { status: 'error', message: 'That file has no rows under its header.' };
  }
  if (rows.length > MAX_ROWS) {
    return { status: 'error', message: `That file has more than ${MAX_ROWS} rows. Split it up.` };
  }

  const importType = type as ImportableType;
  const skipped: { line: number; reason: string }[] = [];
  const valid: Record<string, unknown>[] = [];

  rows.forEach((row, index) => {
    const payload = toPayload(importType, row);
    const schema = {
      water: logWaterSchema,
      activity: logActivitySchema,
      food: logMealSchema,
      sleep: logSleepSchema,
      vitals: logVitalSchema,
      mood: logMoodSchema,
    }[importType];

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      // +2: one for the header, one because humans count from 1.
      skipped.push({ line: index + 2, reason: firstIssue(parsed.error) });
      return;
    }
    valid.push(parsed.data as Record<string, unknown>);
  });

  if (valid.length === 0) {
    return {
      status: 'error',
      message: 'No rows could be read. Check the column names against an export file.',
      skipped: skipped.slice(0, 10),
    };
  }

  try {
    await queryAsUser(async (db) => {
      const owner = sql`auth.uid()`;
      const now = new Date();

      switch (importType) {
        case 'water':
          await db.insert(waterLogs).values(
            valid.map((row) => ({
              userId: owner,
              occurredAt: (row.occurredAt as Date) ?? now,
              amountMl: row.amountMl as number,
              source: 'import' as const,
            })),
          );
          break;
        case 'activity':
          await db.insert(activityLogs).values(
            valid.map((row) => ({
              userId: owner,
              occurredAt: (row.occurredAt as Date) ?? now,
              activitySlug: row.activitySlug as string,
              intensity: row.intensity as 'light' | 'moderate' | 'vigorous',
              durationMinutes: row.durationMinutes as number,
              distanceKm: (row.distanceKm as number | undefined) ?? null,
              notes: (row.notes as string | undefined) ?? null,
              source: 'import' as const,
            })),
          );
          break;
        case 'food':
          await db.insert(foodEntries).values(
            valid.map((row) => ({
              userId: owner,
              occurredAt: (row.occurredAt as Date) ?? now,
              mealType: row.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
              name: row.name as string,
              brand: (row.brand as string | undefined) ?? null,
              foodSource: 'custom' as const,
              quantity: row.quantity as number,
              unit: row.unit as string,
              calories: Math.round(row.calories as number),
              proteinG: row.proteinG as number,
              carbsG: row.carbsG as number,
              fatG: row.fatG as number,
              fiberG: row.fiberG as number,
              sugarG: row.sugarG as number,
              sodiumMg: row.sodiumMg as number,
              source: 'import' as const,
            })),
          );
          break;
        case 'sleep':
          await db.insert(sleepLogs).values(
            valid.map((row) => {
              const bedtime = row.bedtime as Date;
              const wakeTime = row.wakeTime as Date;
              return {
                userId: owner,
                bedtime,
                wakeTime,
                durationMinutes: Math.round((wakeTime.getTime() - bedtime.getTime()) / 60_000),
                quality: (row.quality as number | undefined) ?? null,
                notes: (row.notes as string | undefined) ?? null,
                source: 'import' as const,
              };
            }),
          );
          break;
        case 'vitals':
          await db.insert(vitalReadings).values(
            valid.map((row) => ({
              userId: owner,
              occurredAt: (row.occurredAt as Date) ?? now,
              type: row.type as
                'weight' | 'resting_heart_rate' | 'blood_pressure' | 'blood_glucose',
              value: row.value as number,
              secondaryValue: (row.secondaryValue as number | undefined) ?? null,
              notes: (row.notes as string | undefined) ?? null,
              source: 'import' as const,
            })),
          );
          break;
        case 'mood':
          await db.insert(moodLogs).values(
            valid.map((row) => ({
              userId: owner,
              occurredAt: (row.occurredAt as Date) ?? now,
              score: row.score as number,
              note: (row.note as string | undefined) ?? null,
              tags: (row.tags as string[]) ?? [],
              source: 'import' as const,
            })),
          );
          break;
      }
    });
  } catch (error) {
    console.error('CSV import failed', error);
    return { status: 'error', message: 'Could not save the imported rows. Nothing was changed.' };
  }

  revalidatePath('/today');
  revalidatePath('/trends');

  return { status: 'done', imported: valid.length, skipped: skipped.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

export interface DeleteState {
  status: 'idle' | 'error';
  message?: string;
}

/** Wipes every log but keeps the account and its settings. */
export async function deleteAllLogs(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  if (formData.get('confirm') !== 'DELETE') {
    return { status: 'error', message: 'Type DELETE to confirm.' };
  }

  try {
    await queryAsUser(async (db) => {
      await db.delete(medicationEvents);
      await db.delete(medications);
      await db.delete(moodLogs);
      await db.delete(vitalReadings);
      await db.delete(waterLogs);
      await db.delete(sleepLogs);
      await db.delete(foodEntries);
      await db.delete(stepEntries);
      await db.delete(activityLogs);
    });
  } catch (error) {
    console.error('Log deletion failed', error);
    return { status: 'error', message: 'Could not delete your logs. Nothing was changed.' };
  }

  revalidatePath('/today');
  revalidatePath('/trends');
  return { status: 'idle' };
}

/**
 * Deletes the account itself.
 *
 * Removing the `auth.users` row cascades every owned table away — the foreign
 * keys in migration 0001 are what make this a real deletion rather than a
 * flag. Uses the elevated context because a user cannot delete their own row
 * in Supabase's auth schema under RLS.
 */
export async function deleteAccount(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  if (formData.get('confirm') !== 'DELETE') {
    return { status: 'error', message: 'Type DELETE to confirm.' };
  }

  const user = await requireUser();

  try {
    await withElevatedContext(async (db) => {
      await db.execute(sql`delete from auth.users where id = ${user.id}::uuid`);
    });
  } catch (error) {
    console.error('Account deletion failed', error);
    return { status: 'error', message: 'Could not delete the account. Nothing was changed.' };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/?deleted=1');
}
