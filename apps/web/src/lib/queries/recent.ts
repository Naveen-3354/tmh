import 'server-only';

import { activityLogs, foodEntries, medicationEvents, medications } from '@tmh/db';
import { dayRangeUtc, toDayKey, zonedWallClockToUtc } from '@tmh/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { queryAsUser } from '../auth';

/**
 * "Recent" lists exist to make the repeat case one tap.
 *
 * Most logging is repetition — the same breakfast, the same walk — so
 * re-logging something you have logged before is the single highest-leverage
 * shortcut in the product (RESEARCH.md D1).
 */

export interface RecentFood {
  name: string;
  brand: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  quantity: number;
  unit: string;
  foodSource: 'usda' | 'open_food_facts' | 'custom' | 'recent';
  externalId: string | null;
  timesLogged: number;
}

/** Distinct foods, most-logged first. */
export async function getRecentFoods(limit = 8): Promise<RecentFood[]> {
  return queryAsUser(async (db) => {
    const rows = await db
      .select({
        name: foodEntries.name,
        brand: foodEntries.brand,
        calories: sql<number>`(array_agg(${foodEntries.calories} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        proteinG: sql<number>`(array_agg(${foodEntries.proteinG} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        carbsG: sql<number>`(array_agg(${foodEntries.carbsG} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        fatG: sql<number>`(array_agg(${foodEntries.fatG} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        fiberG: sql<number>`(array_agg(${foodEntries.fiberG} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        sugarG: sql<number>`(array_agg(${foodEntries.sugarG} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        sodiumMg: sql<number>`(array_agg(${foodEntries.sodiumMg} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        quantity: sql<number>`(array_agg(${foodEntries.quantity} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        unit: sql<string>`(array_agg(${foodEntries.unit} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        foodSource: sql<
          RecentFood['foodSource']
        >`(array_agg(${foodEntries.foodSource} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        externalId: sql<
          string | null
        >`(array_agg(${foodEntries.externalId} ORDER BY ${foodEntries.occurredAt} DESC))[1]`,
        timesLogged: sql<number>`count(*)::int`,
      })
      .from(foodEntries)
      .groupBy(foodEntries.name, foodEntries.brand)
      // Most-repeated first, then most-recent — the repeat case is the one
      // worth making a single tap.
      .orderBy(desc(sql`count(*)`), desc(sql`max(${foodEntries.occurredAt})`))
      .limit(limit);

    return rows;
  });
}

export interface RecentActivity {
  activitySlug: string;
  intensity: 'light' | 'moderate' | 'vigorous';
  durationMinutes: number;
  timesLogged: number;
}

/** Distinct activities, most-logged first, with the typical duration. */
export async function getRecentActivities(limit = 6): Promise<RecentActivity[]> {
  return queryAsUser(async (db) => {
    return db
      .select({
        activitySlug: activityLogs.activitySlug,
        intensity: activityLogs.intensity,
        // The median would be better; the mode of typical durations is close
        // enough and far cheaper.
        durationMinutes: sql<number>`round(avg(${activityLogs.durationMinutes}))::int`,
        timesLogged: sql<number>`count(*)::int`,
      })
      .from(activityLogs)
      .groupBy(activityLogs.activitySlug, activityLogs.intensity)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  });
}

export interface DoseToday {
  medicationId: string;
  name: string;
  dosage: string | null;
  scheduledFor: Date;
  status: 'taken' | 'skipped' | null;
}

/**
 * Today's medication doses with their status.
 *
 * Schedule times are stored as local "HH:MM" and resolved against the
 * profile's timezone here, so a dose stays at 9am after a DST change.
 */
export async function getDosesToday(timezone: string): Promise<DoseToday[]> {
  const dayKey = toDayKey(new Date(), timezone);
  const { start, end } = dayRangeUtc(dayKey, timezone);

  return queryAsUser(async (db) => {
    const meds = await db
      .select({
        id: medications.id,
        name: medications.name,
        dosage: medications.dosage,
        scheduleTimes: medications.scheduleTimes,
      })
      .from(medications)
      .where(eq(medications.active, true))
      .orderBy(medications.name);

    if (meds.length === 0) return [];

    const events = await db
      .select({
        medicationId: medicationEvents.medicationId,
        scheduledFor: medicationEvents.scheduledFor,
        status: medicationEvents.status,
      })
      .from(medicationEvents)
      .where(
        and(gte(medicationEvents.scheduledFor, start), lt(medicationEvents.scheduledFor, end)),
      );

    const statusByDose = new Map(
      events.map((event) => [
        `${event.medicationId}|${event.scheduledFor.getTime()}`,
        event.status,
      ]),
    );

    const doses: DoseToday[] = [];
    for (const med of meds) {
      for (const time of med.scheduleTimes) {
        const [hour, minute] = time.split(':').map(Number);
        if (hour === undefined || minute === undefined) continue;
        // Resolved as a wall-clock time, not an offset from midnight: on a
        // 23-hour DST day, adding minutes to midnight would shift the dose.
        const scheduledFor = zonedWallClockToUtc(dayKey, timezone, hour, minute);
        doses.push({
          medicationId: med.id,
          name: med.name,
          dosage: med.dosage,
          scheduledFor,
          status: statusByDose.get(`${med.id}|${scheduledFor.getTime()}`) ?? null,
        });
      }
    }

    return doses.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  });
}
