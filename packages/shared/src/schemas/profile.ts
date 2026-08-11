/**
 * Profile and goal schemas.
 *
 * These are the single source of truth for validation: the web app's server
 * actions and the MCP server's tool definitions both parse against them, so a
 * value that is rejected in one surface is rejected in the other.
 */

import { z } from 'zod';

import { ACTIVITY_LEVELS, SEXES, WEIGHT_GOALS } from '../calc/energy';
import { isValidTimeZone } from '../time';
import { UNIT_SYSTEMS } from '../units';

export const MIN_AGE_YEARS = 13;
export const MAX_AGE_YEARS = 120;

export const timeZoneSchema = z
  .string()
  .min(1, 'Pick a timezone.')
  .refine(isValidTimeZone, 'That is not a recognised IANA timezone.');

export const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'That date does not exist.');

/**
 * Date of birth, constrained to a plausible living age.
 *
 * The lower bound is a product decision, not a legal one: the app is not
 * designed or reviewed for children.
 */
export const birthDateSchema = dayKeySchema.refine((value) => {
  const born = new Date(`${value}T00:00:00Z`);
  const now = new Date();
  const age = (now.getTime() - born.getTime()) / (365.2425 * 86_400_000);
  return age >= MIN_AGE_YEARS && age <= MAX_AGE_YEARS;
}, `Age must be between ${MIN_AGE_YEARS} and ${MAX_AGE_YEARS}.`);

export const heightCmSchema = z
  .number()
  .min(50, 'Height looks too small.')
  .max(280, 'Height looks too large.');

export const weightKgSchema = z
  .number()
  .min(20, 'Weight looks too small.')
  .max(500, 'Weight looks too large.');

export const sexSchema = z.enum(SEXES);
export const unitSystemSchema = z.enum(UNIT_SYSTEMS);
export const activityLevelSchema = z.enum(ACTIVITY_LEVELS);
export const weightGoalSchema = z.enum(WEIGHT_GOALS);

/** Everything onboarding collects in one shot. */
export const onboardingSchema = z.object({
  displayName: z.string().trim().min(1, 'Tell us what to call you.').max(80),
  birthDate: birthDateSchema,
  sex: sexSchema,
  heightCm: heightCmSchema,
  weightKg: weightKgSchema,
  timezone: timeZoneSchema,
  unitSystem: unitSystemSchema,
  activityLevel: activityLevelSchema,
  weightGoal: weightGoalSchema,
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Partial profile edit from the settings screen. */
export const profileUpdateSchema = onboardingSchema.partial().omit({ weightKg: true });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * User-settable daily targets.
 *
 * Bounds mirror the CHECK constraints in the database, so an invalid target is
 * refused at both the edge and the storage layer. Calorie targets are not
 * settable here — they are derived by `safeCalorieTarget` so no path can
 * persist an aggressive deficit.
 */
export const goalsUpdateSchema = z.object({
  waterTargetMl: z.number().int().min(250).max(10_000),
  sleepTargetMinutes: z.number().int().min(180).max(900),
  stepsTarget: z.number().int().min(1_000).max(50_000),
  activeMinutesTarget: z.number().int().min(5).max(600),
});

export type GoalsUpdateInput = z.infer<typeof goalsUpdateSchema>;
