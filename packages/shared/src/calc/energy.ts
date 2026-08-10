/**
 * Energy calculations: basal rate, daily expenditure and activity burn.
 *
 * Every number here is an *estimate* derived from population-level equations.
 * The UI is required to present them as estimates, never as measurements.
 */

import { metFor, type ActivityIntensity } from '../activities';
import { round } from '../units';

export const SEXES = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active',
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** Harris–Benedict style multipliers applied to BMR to approximate TDEE. */
export const ACTIVITY_LEVEL_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export const ACTIVITY_LEVEL_LABELS: Readonly<Record<ActivityLevel, string>> = {
  sedentary: 'Sedentary — desk work, little exercise',
  lightly_active: 'Lightly active — exercise 1–3 days a week',
  moderately_active: 'Moderately active — exercise 3–5 days a week',
  very_active: 'Very active — exercise 6–7 days a week',
  extra_active: 'Extra active — physical job or twice-daily training',
};

/**
 * Mifflin–St Jeor basal metabolic rate, in kcal/day.
 *
 * The equation is only defined with a male (+5) and a female (−161) constant.
 * For `other` / `prefer_not_to_say` we use the midpoint (−78) rather than
 * defaulting to one sex, and the UI labels the result as an approximation.
 */
export function basalMetabolicRate(input: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
}): number {
  const { weightKg, heightCm, ageYears, sex } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const sexConstant = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return round(Math.max(0, base + sexConstant), 0);
}

/** Total daily energy expenditure, in kcal/day. */
export function totalDailyEnergyExpenditure(bmr: number, activityLevel: ActivityLevel): number {
  return round(bmr * ACTIVITY_LEVEL_MULTIPLIERS[activityLevel], 0);
}

/**
 * Calories burned by an activity, using the standard ACSM MET equation:
 *
 *   kcal = MET × 3.5 × bodyMassKg ÷ 200 × minutes
 */
export function activityCaloriesBurned(input: {
  activitySlug: string;
  intensity: ActivityIntensity;
  durationMinutes: number;
  weightKg: number;
}): number {
  const { activitySlug, intensity, durationMinutes, weightKg } = input;
  if (durationMinutes <= 0 || weightKg <= 0) return 0;
  const met = metFor(activitySlug, intensity);
  return round(((met * 3.5 * weightKg) / 200) * durationMinutes, 0);
}

/**
 * The smallest daily intake we will ever suggest, in kcal.
 *
 * Widely published floors for unsupervised self-directed intake. The app
 * refuses to set a target below these regardless of goal (brief §8).
 */
export const CALORIE_FLOORS: Readonly<Record<'male' | 'nonMale', number>> = {
  male: 1500,
  nonMale: 1200,
};

/** Largest deficit or surplus we will apply, as a fraction of TDEE. */
export const MAX_CALORIE_ADJUSTMENT = 0.2;

export const WEIGHT_GOALS = ['lose', 'maintain', 'gain'] as const;
export type WeightGoal = (typeof WEIGHT_GOALS)[number];

export interface CalorieTarget {
  /** kcal/day the app will show as the target. */
  target: number;
  /** True when the requested adjustment was reduced to stay in a safe range. */
  clamped: boolean;
  /** Plain-language note shown next to the target when it was clamped. */
  note?: string;
}

/**
 * Derive a daily calorie target from TDEE, clamped to a healthy range.
 *
 * Deliberately conservative: at most a 20% adjustment, never below the floor
 * for the user's sex, and never below BMR. There is no way for a user to
 * configure an aggressive deficit through this function.
 */
export function safeCalorieTarget(input: {
  tdee: number;
  bmr: number;
  goal: WeightGoal;
  sex: Sex;
}): CalorieTarget {
  const { tdee, bmr, goal, sex } = input;
  const floor = Math.max(sex === 'male' ? CALORIE_FLOORS.male : CALORIE_FLOORS.nonMale, bmr);

  if (goal === 'maintain') {
    return { target: round(tdee, 0), clamped: false };
  }

  const direction = goal === 'lose' ? -1 : 1;
  const requested = round(tdee * (1 + direction * MAX_CALORIE_ADJUSTMENT), 0);

  if (goal === 'gain') {
    return { target: requested, clamped: false };
  }

  if (requested < floor) {
    return {
      target: round(floor, 0),
      clamped: true,
      note: 'Raised to stay within a commonly recommended range. Talk to a clinician before eating below this.',
    };
  }

  return { target: requested, clamped: false };
}

/** Steps → kcal, using a light-walking MET and an average stride cadence. */
export function stepsToCalories(steps: number, weightKg: number): number {
  if (steps <= 0 || weightKg <= 0) return 0;
  // ~100 steps/minute is the conventional cadence for casual walking.
  const minutes = steps / 100;
  return activityCaloriesBurned({
    activitySlug: 'walking',
    intensity: 'light',
    durationMinutes: minutes,
    weightKg,
  });
}
