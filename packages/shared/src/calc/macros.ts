/**
 * Macronutrient arithmetic: totals, energy equivalence and target splits.
 */

import { round } from '../units';

/** Atwater energy factors, kcal per gram. */
export const KCAL_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
  fiber: 2,
  alcohol: 7,
} as const;

export interface NutritionFacts {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
}

export const EMPTY_NUTRITION: Readonly<NutritionFacts> = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
};

type PartialNutrition = Partial<NutritionFacts>;

/** Sum any number of (possibly sparse) nutrition rows into a complete total. */
export function sumNutrition(entries: readonly PartialNutrition[]): NutritionFacts {
  const total = entries.reduce<NutritionFacts>(
    (accumulator, entry) => ({
      calories: accumulator.calories + (entry.calories ?? 0),
      proteinG: accumulator.proteinG + (entry.proteinG ?? 0),
      carbsG: accumulator.carbsG + (entry.carbsG ?? 0),
      fatG: accumulator.fatG + (entry.fatG ?? 0),
      fiberG: accumulator.fiberG + (entry.fiberG ?? 0),
      sugarG: accumulator.sugarG + (entry.sugarG ?? 0),
      sodiumMg: accumulator.sodiumMg + (entry.sodiumMg ?? 0),
    }),
    { ...EMPTY_NUTRITION },
  );

  return {
    calories: round(total.calories, 0),
    proteinG: round(total.proteinG, 1),
    carbsG: round(total.carbsG, 1),
    fatG: round(total.fatG, 1),
    fiberG: round(total.fiberG, 1),
    sugarG: round(total.sugarG, 1),
    sodiumMg: round(total.sodiumMg, 0),
  };
}

/** Scale a per-100g/per-serving nutrition row by a quantity multiplier. */
export function scaleNutrition(facts: PartialNutrition, multiplier: number): NutritionFacts {
  const factor = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 0;
  return {
    calories: round((facts.calories ?? 0) * factor, 0),
    proteinG: round((facts.proteinG ?? 0) * factor, 1),
    carbsG: round((facts.carbsG ?? 0) * factor, 1),
    fatG: round((facts.fatG ?? 0) * factor, 1),
    fiberG: round((facts.fiberG ?? 0) * factor, 1),
    sugarG: round((facts.sugarG ?? 0) * factor, 1),
    sodiumMg: round((facts.sodiumMg ?? 0) * factor, 0),
  };
}

/** Energy implied by the macros alone, used to sanity-check imported foods. */
export function caloriesFromMacros(macros: {
  proteinG: number;
  carbsG: number;
  fatG: number;
}): number {
  return round(
    macros.proteinG * KCAL_PER_GRAM.protein +
      macros.carbsG * KCAL_PER_GRAM.carbs +
      macros.fatG * KCAL_PER_GRAM.fat,
    0,
  );
}

export interface MacroSplit {
  /** Fractions of total energy. Must sum to 1. */
  protein: number;
  carbs: number;
  fat: number;
}

/** A balanced default split, in line with general dietary guidance. */
export const DEFAULT_MACRO_SPLIT: Readonly<MacroSplit> = {
  protein: 0.25,
  carbs: 0.45,
  fat: 0.3,
};

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Convert a calorie target and an energy split into gram targets. */
export function macroTargets(
  calorieTarget: number,
  split: MacroSplit = DEFAULT_MACRO_SPLIT,
): MacroTargets {
  const safeTarget = Math.max(0, calorieTarget);
  return {
    proteinG: round((safeTarget * split.protein) / KCAL_PER_GRAM.protein, 0),
    carbsG: round((safeTarget * split.carbs) / KCAL_PER_GRAM.carbs, 0),
    fatG: round((safeTarget * split.fat) / KCAL_PER_GRAM.fat, 0),
  };
}

/**
 * Progress toward a target as a 0–1 fraction plus the raw percentage.
 *
 * Not clamped at the top: going over a target is information the user should
 * see, and the UI renders overflow differently rather than hiding it.
 */
export function progressToward(
  value: number,
  target: number,
): { fraction: number; percent: number } {
  if (target <= 0) return { fraction: 0, percent: 0 };
  const fraction = value / target;
  return { fraction, percent: round(fraction * 100, 0) };
}
