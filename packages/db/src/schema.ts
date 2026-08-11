/**
 * Drizzle schema for tmh.
 *
 * Conventions that hold across every table:
 *   - `user_id` on every user-owned row. Row-level security keys off it, so a
 *     table without it would be unprotectable (see migrations/0001_rls.sql).
 *   - Instants are `timestamptz` stored in UTC. The user's IANA zone lives on
 *     the profile and decides which calendar day a row belongs to.
 *   - Measurements are stored metric. Imperial exists only at the display edge.
 *   - `source` records how a row arrived, so an import or an MCP write can be
 *     audited or rolled back independently of manual entry.
 *
 * Foreign keys to `auth.users` are added in the RLS migration rather than
 * declared here: drizzle-kit would otherwise try to manage Supabase's own
 * `auth` schema.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const sexEnum = pgEnum('sex', ['male', 'female', 'other', 'prefer_not_to_say']);
export const unitSystemEnum = pgEnum('unit_system', ['metric', 'imperial']);
export const activityLevelEnum = pgEnum('activity_level', [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active',
]);
export const weightGoalEnum = pgEnum('weight_goal', ['lose', 'maintain', 'gain']);
export const activityIntensityEnum = pgEnum('activity_intensity', [
  'light',
  'moderate',
  'vigorous',
]);
export const mealTypeEnum = pgEnum('meal_type', ['breakfast', 'lunch', 'dinner', 'snack']);
export const foodSourceEnum = pgEnum('food_source', [
  'usda',
  'open_food_facts',
  'custom',
  'recent',
]);
export const vitalTypeEnum = pgEnum('vital_type', [
  'weight',
  'resting_heart_rate',
  'blood_pressure',
  'blood_glucose',
]);
export const medicationStatusEnum = pgEnum('medication_status', ['taken', 'skipped']);

/** How a row arrived. Lets an import or an MCP write be audited separately. */
export const entrySourceEnum = pgEnum('entry_source', ['manual', 'mcp', 'import', 'demo']);

// Columns every log table repeats.
const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

// ---------------------------------------------------------------------------
// Profile and goals
// ---------------------------------------------------------------------------

export const profiles = pgTable(
  'profiles',
  {
    /** Mirrors auth.users.id. FK added in the RLS migration. */
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    birthDate: date('birth_date'),
    sex: sexEnum('sex').default('prefer_not_to_say').notNull(),
    heightCm: doublePrecision('height_cm'),
    /** IANA zone, e.g. "Asia/Kolkata". Decides local day boundaries. */
    timezone: text('timezone').default('UTC').notNull(),
    unitSystem: unitSystemEnum('unit_system').default('metric').notNull(),
    activityLevel: activityLevelEnum('activity_level').default('lightly_active').notNull(),
    weightGoal: weightGoalEnum('weight_goal').default('maintain').notNull(),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    /** Marks the seeded demo account so it can be reset or excluded. */
    isDemo: boolean('is_demo').default(false).notNull(),
    ...auditColumns,
  },
  (table) => [
    check(
      'profiles_height_sane',
      sql`${table.heightCm} IS NULL OR (${table.heightCm} BETWEEN 50 AND 280)`,
    ),
  ],
);

export const goals = pgTable(
  'goals',
  {
    userId: uuid('user_id').primaryKey(),
    /** Always produced by safeCalorieTarget(), never set freehand. */
    calorieTarget: integer('calorie_target'),
    proteinTargetG: integer('protein_target_g'),
    carbsTargetG: integer('carbs_target_g'),
    fatTargetG: integer('fat_target_g'),
    waterTargetMl: integer('water_target_ml').default(2000).notNull(),
    sleepTargetMinutes: integer('sleep_target_minutes').default(480).notNull(),
    stepsTarget: integer('steps_target').default(8000).notNull(),
    activeMinutesTarget: integer('active_minutes_target').default(30).notNull(),
    ...auditColumns,
  },
  (table) => [
    // Enforces the "no aggressive deficit" rule at the storage layer, not just
    // in the UI: nothing can persist a starvation target, including the MCP
    // server or a CSV import.
    check(
      'goals_calorie_floor',
      sql`${table.calorieTarget} IS NULL OR (${table.calorieTarget} BETWEEN 1200 AND 8000)`,
    ),
    check('goals_water_sane', sql`${table.waterTargetMl} BETWEEN 250 AND 10000`),
    check('goals_sleep_sane', sql`${table.sleepTargetMinutes} BETWEEN 180 AND 900`),
  ],
);

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    activitySlug: text('activity_slug').notNull(),
    intensity: activityIntensityEnum('intensity').default('moderate').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    distanceKm: doublePrecision('distance_km'),
    /** Estimated via the ACSM MET equation at write time. */
    caloriesBurned: integer('calories_burned'),
    notes: text('notes'),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    index('activity_logs_user_time_idx').on(table.userId, table.occurredAt),
    check('activity_logs_duration_positive', sql`${table.durationMinutes} > 0`),
    check('activity_logs_duration_sane', sql`${table.durationMinutes} <= 1440`),
  ],
);

export const stepEntries = pgTable(
  'step_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    /** Local calendar day, already resolved in the user's timezone. */
    day: date('day').notNull(),
    steps: integer('steps').notNull(),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    // One total per day per source, so re-importing Google Fit updates rather
    // than duplicates.
    uniqueIndex('step_entries_user_day_source_key').on(table.userId, table.day, table.source),
    index('step_entries_user_day_idx').on(table.userId, table.day),
    check('step_entries_non_negative', sql`${table.steps} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export const foodEntries = pgTable(
  'food_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    mealType: mealTypeEnum('meal_type').notNull(),
    name: text('name').notNull(),
    brand: text('brand'),
    /** Which database the numbers came from. Surfaced in the UI on every row. */
    foodSource: foodSourceEnum('food_source').default('custom').notNull(),
    /** FDC id or Open Food Facts code, for re-lookup. */
    externalId: text('external_id'),
    barcode: text('barcode'),
    quantity: doublePrecision('quantity').default(1).notNull(),
    unit: text('unit').default('serving').notNull(),
    calories: integer('calories').notNull(),
    proteinG: doublePrecision('protein_g').default(0).notNull(),
    carbsG: doublePrecision('carbs_g').default(0).notNull(),
    fatG: doublePrecision('fat_g').default(0).notNull(),
    fiberG: doublePrecision('fiber_g').default(0).notNull(),
    sugarG: doublePrecision('sugar_g').default(0).notNull(),
    sodiumMg: doublePrecision('sodium_mg').default(0).notNull(),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    index('food_entries_user_time_idx').on(table.userId, table.occurredAt),
    index('food_entries_user_name_idx').on(table.userId, table.name),
    check('food_entries_calories_non_negative', sql`${table.calories} >= 0`),
    check('food_entries_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Sleep, hydration, vitals, mood
// ---------------------------------------------------------------------------

export const sleepLogs = pgTable(
  'sleep_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    bedtime: timestamp('bedtime', { withTimezone: true }).notNull(),
    wakeTime: timestamp('wake_time', { withTimezone: true }).notNull(),
    /** Denormalised so trend queries never recompute across a DST boundary. */
    durationMinutes: integer('duration_minutes').notNull(),
    quality: integer('quality'),
    notes: text('notes'),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    index('sleep_logs_user_time_idx').on(table.userId, table.wakeTime),
    check(
      'sleep_logs_quality_range',
      sql`${table.quality} IS NULL OR (${table.quality} BETWEEN 1 AND 5)`,
    ),
    check('sleep_logs_ordered', sql`${table.wakeTime} > ${table.bedtime}`),
    check('sleep_logs_duration_sane', sql`${table.durationMinutes} BETWEEN 1 AND 1440`),
  ],
);

export const waterLogs = pgTable(
  'water_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    amountMl: integer('amount_ml').notNull(),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    index('water_logs_user_time_idx').on(table.userId, table.occurredAt),
    check('water_logs_amount_positive', sql`${table.amountMl} > 0`),
    check('water_logs_amount_sane', sql`${table.amountMl} <= 5000`),
  ],
);

export const vitalReadings = pgTable(
  'vital_readings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    type: vitalTypeEnum('type').notNull(),
    /** Primary measurement: kg, bpm, systolic mmHg, or mmol/L. */
    value: doublePrecision('value').notNull(),
    /** Diastolic, for blood pressure only. */
    secondaryValue: doublePrecision('secondary_value'),
    notes: text('notes'),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    index('vital_readings_user_type_time_idx').on(table.userId, table.type, table.occurredAt),
    check('vital_readings_value_positive', sql`${table.value} > 0`),
    // Blood pressure is the only type that carries a second number.
    check(
      'vital_readings_secondary_only_for_bp',
      sql`${table.secondaryValue} IS NULL OR ${table.type} = 'blood_pressure'`,
    ),
  ],
);

export const moodLogs = pgTable(
  'mood_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** 1 (very low) to 5 (very good). */
    score: integer('score').notNull(),
    note: text('note'),
    /** Free-form symptom tags, e.g. {headache,fatigue}. */
    tags: text('tags')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    index('mood_logs_user_time_idx').on(table.userId, table.occurredAt),
    check('mood_logs_score_range', sql`${table.score} BETWEEN 1 AND 5`),
  ],
);

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

export const medications = pgTable(
  'medications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    dosage: text('dosage'),
    /** Local times of day, "HH:MM", evaluated in the profile timezone. */
    scheduleTimes: text('schedule_times')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    active: boolean('active').default(true).notNull(),
    startedOn: date('started_on'),
    notes: text('notes'),
    ...auditColumns,
  },
  (table) => [index('medications_user_active_idx').on(table.userId, table.active)],
);

export const medicationEvents = pgTable(
  'medication_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    medicationId: uuid('medication_id').notNull(),
    /** The dose this event answers for. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    status: medicationStatusEnum('status').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
    source: entrySourceEnum('source').default('manual').notNull(),
    ...auditColumns,
  },
  (table) => [
    // One answer per scheduled dose; marking taken twice is idempotent.
    uniqueIndex('medication_events_dose_key').on(table.medicationId, table.scheduledFor),
    index('medication_events_user_time_idx').on(table.userId, table.scheduledFor),
  ],
);

// ---------------------------------------------------------------------------
// MCP access tokens
// ---------------------------------------------------------------------------

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    /** SHA-256 of the token. The plaintext is shown once and never stored. */
    tokenHash: text('token_hash').notNull(),
    /** First few characters, so the UI can identify a token in a list. */
    prefix: text('prefix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('api_tokens_hash_key').on(table.tokenHash),
    index('api_tokens_user_idx').on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Goals = typeof goals.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type StepEntry = typeof stepEntries.$inferSelect;
export type FoodEntry = typeof foodEntries.$inferSelect;
export type SleepLog = typeof sleepLogs.$inferSelect;
export type WaterLog = typeof waterLogs.$inferSelect;
export type VitalReading = typeof vitalReadings.$inferSelect;
export type MoodLog = typeof moodLogs.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type MedicationEvent = typeof medicationEvents.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;

/** Every user-owned table, in dependency order. Used by export and deletion. */
export const USER_DATA_TABLES = [
  'profiles',
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
  'api_tokens',
] as const;

export type UserDataTable = (typeof USER_DATA_TABLES)[number];
