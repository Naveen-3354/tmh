import { describe, expect, it } from 'vitest';

import {
  caloriesFromMacros,
  DEFAULT_MACRO_SPLIT,
  macroTargets,
  progressToward,
  scaleNutrition,
  sumNutrition,
} from './macros';

describe('sumNutrition', () => {
  it('totals sparse entries without producing NaN', () => {
    const total = sumNutrition([
      { calories: 250, proteinG: 12, carbsG: 30, fatG: 8 },
      { calories: 130, proteinG: 4.5, fiberG: 3 },
      { sodiumMg: 400 },
    ]);
    expect(total).toEqual({
      calories: 380,
      proteinG: 16.5,
      carbsG: 30,
      fatG: 8,
      fiberG: 3,
      sugarG: 0,
      sodiumMg: 400,
    });
  });

  it('returns a zeroed total for an empty log', () => {
    expect(sumNutrition([])).toEqual({
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    });
  });

  it('does not accumulate floating-point drift', () => {
    const total = sumNutrition(Array.from({ length: 10 }, () => ({ proteinG: 0.1 })));
    expect(total.proteinG).toBe(1);
  });
});

describe('scaleNutrition', () => {
  it('scales a per-100g row to an arbitrary serving', () => {
    const per100g = { calories: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2 };
    expect(scaleNutrition(per100g, 1.82)).toEqual({
      calories: 95,
      proteinG: 0.5,
      carbsG: 25.5,
      fatG: 0.4,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    });
  });

  it('treats a non-positive or non-finite multiplier as zero', () => {
    const per100g = { calories: 52, proteinG: 0.3 };
    expect(scaleNutrition(per100g, -1).calories).toBe(0);
    expect(scaleNutrition(per100g, Number.NaN).calories).toBe(0);
  });
});

describe('caloriesFromMacros', () => {
  it('applies Atwater factors', () => {
    expect(caloriesFromMacros({ proteinG: 30, carbsG: 50, fatG: 10 })).toBe(410);
  });
});

describe('macroTargets', () => {
  it('splits a calorie target into gram targets', () => {
    expect(macroTargets(2000)).toEqual({ proteinG: 125, carbsG: 225, fatG: 67 });
  });

  it('uses a split that accounts for all energy', () => {
    const sum = DEFAULT_MACRO_SPLIT.protein + DEFAULT_MACRO_SPLIT.carbs + DEFAULT_MACRO_SPLIT.fat;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('clamps a negative target to zero rather than inverting it', () => {
    expect(macroTargets(-500)).toEqual({ proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('progressToward', () => {
  it('reports fractional progress', () => {
    expect(progressToward(1500, 2000)).toEqual({ fraction: 0.75, percent: 75 });
  });

  it('reports overflow rather than clamping at 100%', () => {
    expect(progressToward(2400, 2000).percent).toBe(120);
  });

  it('does not divide by a zero target', () => {
    expect(progressToward(500, 0)).toEqual({ fraction: 0, percent: 0 });
  });
});
