import 'server-only';

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
} from '@tmh/db';

import { queryAsUser } from './auth';

/**
 * Full data export.
 *
 * Everything, in one call, in formats a person can actually open. Export is a
 * first-class feature here rather than a settings footnote (RESEARCH.md D3) —
 * lock-in is the complaint that turns users off a tracker permanently.
 */

export const EXPORTABLE_TABLES = [
  'profile',
  'goals',
  'activity_logs',
  'step_entries',
  'food_entries',
  'sleep_logs',
  'water_logs',
  'vital_readings',
  'mood_logs',
  'medications',
  'medication_events',
] as const;

export type ExportableTable = (typeof EXPORTABLE_TABLES)[number];

export type ExportBundle = {
  exportedAt: string;
  format: 1;
  tables: Record<ExportableTable, Record<string, unknown>[]>;
};

/** Reads every owned row. RLS scopes each select to the caller. */
export async function buildExportBundle(): Promise<ExportBundle> {
  const tables = await queryAsUser(async (db) => {
    const [profile, goalRows, activity, steps, food, sleep, water, vitals, mood, meds, medEvents] =
      await Promise.all([
        db.select().from(profiles),
        db.select().from(goals),
        db.select().from(activityLogs),
        db.select().from(stepEntries),
        db.select().from(foodEntries),
        db.select().from(sleepLogs),
        db.select().from(waterLogs),
        db.select().from(vitalReadings),
        db.select().from(moodLogs),
        db.select().from(medications),
        db.select().from(medicationEvents),
      ]);

    return {
      profile,
      goals: goalRows,
      activity_logs: activity,
      step_entries: steps,
      food_entries: food,
      sleep_logs: sleep,
      water_logs: water,
      vital_readings: vitals,
      mood_logs: mood,
      medications: meds,
      medication_events: medEvents,
    } as ExportBundle['tables'];
  });

  return { exportedAt: new Date().toISOString(), format: 1, tables };
}

/** RFC 4180 escaping: quote when the value contains a delimiter, quote or newline. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    value instanceof Date
      ? value.toISOString()
      : Array.isArray(value)
        ? value.join('|')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** One table as CSV. Column order follows the first row's keys. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0] as Record<string, unknown>);
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  return lines.join('\r\n');
}

/**
 * The whole bundle as one CSV file, with a `table` column.
 *
 * A zip would be tidier but needs a dependency; a single labelled file opens
 * in any spreadsheet and is trivially splittable.
 */
export function bundleToCsv(bundle: ExportBundle): string {
  const sections: string[] = [];
  for (const [table, rows] of Object.entries(bundle.tables)) {
    if (rows.length === 0) continue;
    sections.push(`# ${table}`);
    sections.push(toCsv(rows));
    sections.push('');
  }
  return sections.join('\r\n');
}
