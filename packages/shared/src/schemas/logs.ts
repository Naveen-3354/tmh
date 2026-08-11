/**
 * Input schemas for every log type.
 *
 * These are the contract. The web app's server actions parse against them and
 * so does every MCP write tool, which is what makes "the MCP server has the
 * same rules as the app" true rather than aspirational.
 *
 * Bounds deliberately mirror the CHECK constraints in
 * packages/db/migrations/0001_rls_and_constraints.sql. Validation here gives a
 * readable message; the database is what actually guarantees the invariant.
 */

import { z } from 'zod';

import { ACTIVITY_INTENSITIES, ACTIVITY_SLUGS } from '../activities';

/** An instant. Accepts an ISO string or a Date; defaults to now at the call site. */
export const instantSchema = z.coerce
  .date()
  .describe('ISO 8601 timestamp, e.g. 2026-08-11T09:30:00Z. Defaults to now.');

export const optionalInstantSchema = instantSchema.optional();

export const noteSchema = z.string().trim().max(2000).optional();

/** Where a write came from. The UI never sets this; each caller supplies its own. */
export const ENTRY_SOURCES = ['manual', 'mcp', 'import', 'demo'] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

/**
 * Log types that CSV import understands.
 *
 * Lives here rather than beside the import action because a `'use server'`
 * module may only export async functions — exporting a plain array from one
 * hands the client an action reference instead of the value.
 */
export const IMPORTABLE_TYPES = ['water', 'activity', 'food', 'sleep', 'vitals', 'mood'] as const;
export type ImportableType = (typeof IMPORTABLE_TYPES)[number];

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export const logWaterSchema = z.object({
  amountMl: z
    .number()
    .int('Use a whole number of millilitres.')
    .min(1, 'Amount must be positive.')
    .max(5000, 'That is more than one sitting — log it as several entries.')
    .describe('Volume in millilitres.'),
  occurredAt: optionalInstantSchema,
});
export type LogWaterInput = z.infer<typeof logWaterSchema>;

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const activitySlugSchema = z
  .string()
  .min(1)
  .describe(
    `Activity identifier. Known values: ${ACTIVITY_SLUGS.join(', ')}. Unknown slugs fall back to a generic MET.`,
  );

export const logActivitySchema = z.object({
  activitySlug: activitySlugSchema,
  intensity: z.enum(ACTIVITY_INTENSITIES).default('moderate'),
  durationMinutes: z
    .number()
    .int()
    .min(1, 'Duration must be at least a minute.')
    .max(1440, 'A single activity cannot exceed 24 hours.'),
  distanceKm: z.number().min(0).max(1000).optional(),
  notes: noteSchema,
  occurredAt: optionalInstantSchema,
});
export type LogActivityInput = z.infer<typeof logActivitySchema>;

export const logStepsSchema = z.object({
  steps: z.number().int().min(0).max(200_000),
  /** Local calendar day, YYYY-MM-DD. Defaults to today in the user's zone. */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
    .optional(),
});
export type LogStepsInput = z.infer<typeof logStepsSchema>;

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const FOOD_SOURCES = ['usda', 'open_food_facts', 'custom', 'recent'] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

/** Nutrition numbers for one logged serving. */
export const nutritionSchema = z.object({
  calories: z.number().min(0).max(20_000),
  proteinG: z.number().min(0).max(2000).default(0),
  carbsG: z.number().min(0).max(2000).default(0),
  fatG: z.number().min(0).max(2000).default(0),
  fiberG: z.number().min(0).max(500).default(0),
  sugarG: z.number().min(0).max(2000).default(0),
  sodiumMg: z.number().min(0).max(100_000).default(0),
});

export const logMealSchema = nutritionSchema.extend({
  mealType: z.enum(MEAL_TYPES),
  name: z.string().trim().min(1, 'Give the food a name.').max(200),
  brand: z.string().trim().max(120).optional(),
  foodSource: z.enum(FOOD_SOURCES).default('custom'),
  /** FDC id or Open Food Facts barcode, so the entry can be looked up again. */
  externalId: z.string().trim().max(120).optional(),
  barcode: z.string().trim().max(64).optional(),
  quantity: z.number().positive('Quantity must be positive.').max(1000).default(1),
  unit: z.string().trim().min(1).max(32).default('serving'),
  occurredAt: optionalInstantSchema,
});
export type LogMealInput = z.infer<typeof logMealSchema>;

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

export const logSleepSchema = z
  .object({
    bedtime: instantSchema,
    wakeTime: instantSchema,
    quality: z.number().int().min(1).max(5).optional().describe('1 (poor) to 5 (excellent).'),
    notes: noteSchema,
  })
  .refine((value) => value.wakeTime.getTime() > value.bedtime.getTime(), {
    message: 'Wake time must be after bedtime.',
    path: ['wakeTime'],
  })
  .refine((value) => value.wakeTime.getTime() - value.bedtime.getTime() <= 24 * 60 * 60 * 1000, {
    message: 'A single sleep entry cannot span more than 24 hours.',
    path: ['wakeTime'],
  });
export type LogSleepInput = z.infer<typeof logSleepSchema>;

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

export const VITAL_TYPES = [
  'weight',
  'resting_heart_rate',
  'blood_pressure',
  'blood_glucose',
] as const;
export type VitalType = (typeof VITAL_TYPES)[number];

/**
 * Plausible ranges per vital, in stored (metric) units.
 *
 * These reject typos, not people — the bounds are wide enough to include
 * genuinely unusual readings, because refusing to record a real measurement
 * would be worse than recording an odd one.
 */
export const VITAL_RANGES: Readonly<
  Record<VitalType, { min: number; max: number; unit: string; label: string }>
> = {
  weight: { min: 20, max: 500, unit: 'kg', label: 'Weight' },
  resting_heart_rate: { min: 25, max: 220, unit: 'bpm', label: 'Resting heart rate' },
  blood_pressure: { min: 50, max: 260, unit: 'mmHg', label: 'Blood pressure' },
  blood_glucose: { min: 1, max: 40, unit: 'mmol/L', label: 'Blood glucose' },
};

export const logVitalSchema = z
  .object({
    type: z.enum(VITAL_TYPES),
    value: z.number().positive('Enter a positive value.'),
    /** Diastolic. Blood pressure only. */
    secondaryValue: z.number().positive().optional(),
    notes: noteSchema,
    occurredAt: optionalInstantSchema,
  })
  .superRefine((input, ctx) => {
    const range = VITAL_RANGES[input.type];
    if (input.value < range.min || input.value > range.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `${range.label} should be between ${range.min} and ${range.max} ${range.unit}.`,
      });
    }

    if (input.type === 'blood_pressure') {
      if (input.secondaryValue === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['secondaryValue'],
          message: 'Blood pressure needs both systolic and diastolic values.',
        });
      } else if (input.secondaryValue >= input.value) {
        ctx.addIssue({
          code: 'custom',
          path: ['secondaryValue'],
          message: 'Diastolic should be lower than systolic.',
        });
      }
    } else if (input.secondaryValue !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['secondaryValue'],
        message: 'Only blood pressure takes a second value.',
      });
    }
  });
export type LogVitalInput = z.infer<typeof logVitalSchema>;

// ---------------------------------------------------------------------------
// Mood and symptoms
// ---------------------------------------------------------------------------

export const MOOD_LABELS: Readonly<Record<number, string>> = {
  1: 'Very low',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Very good',
};

/** Suggested symptom tags. Free text is also allowed. */
export const SYMPTOM_TAGS = [
  'headache',
  'fatigue',
  'nausea',
  'sore',
  'stressed',
  'anxious',
  'bloated',
  'congested',
  'dizzy',
  'energised',
  'focused',
  'calm',
] as const;

export const logMoodSchema = z.object({
  score: z.number().int().min(1).max(5).describe('1 (very low) to 5 (very good).'),
  note: noteSchema,
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  occurredAt: optionalInstantSchema,
});
export type LogMoodInput = z.infer<typeof logMoodSchema>;

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, e.g. 09:00.');

export const createMedicationSchema = z.object({
  name: z.string().trim().min(1, 'Give the medication a name.').max(120),
  dosage: z.string().trim().max(80).optional(),
  scheduleTimes: z.array(timeOfDaySchema).max(8).default([]),
  notes: noteSchema,
});
export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;

export const MEDICATION_STATUSES = ['taken', 'skipped'] as const;
export type MedicationStatus = (typeof MEDICATION_STATUSES)[number];

export const logMedicationSchema = z.object({
  medicationId: z.uuid('Unknown medication.'),
  /** The scheduled dose this answers for. Defaults to the nearest dose today. */
  scheduledFor: optionalInstantSchema,
  status: z.enum(MEDICATION_STATUSES).default('taken'),
});
export type LogMedicationInput = z.infer<typeof logMedicationSchema>;

// ---------------------------------------------------------------------------
// Shared result shape
// ---------------------------------------------------------------------------

/**
 * What every write returns.
 *
 * MCP write tools are required to confirm with the created record's id, and
 * the web app uses the same shape so both surfaces report success identically.
 */
export interface LogResult {
  ok: true;
  id: string;
  kind: string;
  summary: string;
}

export interface LogFailure {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
}

export type LogOutcome = LogResult | LogFailure;
