import { describe, expect, it } from 'vitest';

import {
  activityCaloriesBurned,
  basalMetabolicRate,
  safeCalorieTarget,
  stepsToCalories,
  totalDailyEnergyExpenditure,
} from './energy';

describe('basalMetabolicRate', () => {
  it('applies the Mifflin–St Jeor male constant', () => {
    // 10(80) + 6.25(180) − 5(30) + 5
    expect(basalMetabolicRate({ weightKg: 80, heightCm: 180, ageYears: 30, sex: 'male' })).toBe(
      1780,
    );
  });

  it('applies the Mifflin–St Jeor female constant', () => {
    // 10(65) + 6.25(165) − 5(30) − 161
    expect(basalMetabolicRate({ weightKg: 65, heightCm: 165, ageYears: 30, sex: 'female' })).toBe(
      1370,
    );
  });

  it('uses the midpoint constant rather than defaulting to a sex', () => {
    const other = basalMetabolicRate({ weightKg: 65, heightCm: 165, ageYears: 30, sex: 'other' });
    const male = basalMetabolicRate({ weightKg: 65, heightCm: 165, ageYears: 30, sex: 'male' });
    const female = basalMetabolicRate({ weightKg: 65, heightCm: 165, ageYears: 30, sex: 'female' });
    expect(other).toBe(1453);
    expect(other).toBeGreaterThan(female);
    expect(other).toBeLessThan(male);
    expect(
      basalMetabolicRate({ weightKg: 65, heightCm: 165, ageYears: 30, sex: 'prefer_not_to_say' }),
    ).toBe(other);
  });

  it('never returns a negative rate for implausible inputs', () => {
    expect(
      basalMetabolicRate({ weightKg: 1, heightCm: 1, ageYears: 120, sex: 'female' }),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('totalDailyEnergyExpenditure', () => {
  it('scales BMR by the activity multiplier', () => {
    expect(totalDailyEnergyExpenditure(1780, 'sedentary')).toBe(2136);
    expect(totalDailyEnergyExpenditure(1780, 'moderately_active')).toBe(2759);
  });

  it('increases monotonically with activity level', () => {
    const levels = [
      'sedentary',
      'lightly_active',
      'moderately_active',
      'very_active',
      'extra_active',
    ] as const;
    const values = levels.map((level) => totalDailyEnergyExpenditure(1600, level));
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
  });
});

describe('activityCaloriesBurned', () => {
  it('applies the ACSM MET equation', () => {
    // 9.8 MET × 3.5 × 70 kg ÷ 200 × 30 min
    expect(
      activityCaloriesBurned({
        activitySlug: 'running',
        intensity: 'moderate',
        durationMinutes: 30,
        weightKg: 70,
      }),
    ).toBe(360);
  });

  it('burns more at higher intensity for the same duration', () => {
    const base = { activitySlug: 'cycling', durationMinutes: 45, weightKg: 70 } as const;
    const light = activityCaloriesBurned({ ...base, intensity: 'light' });
    const vigorous = activityCaloriesBurned({ ...base, intensity: 'vigorous' });
    expect(vigorous).toBeGreaterThan(light);
  });

  it('falls back to a generic MET for an unknown activity instead of throwing', () => {
    const burn = activityCaloriesBurned({
      activitySlug: 'underwater-basket-weaving',
      intensity: 'moderate',
      durationMinutes: 30,
      weightKg: 70,
    });
    expect(burn).toBeGreaterThan(0);
  });

  it('returns zero for non-positive duration or weight', () => {
    expect(
      activityCaloriesBurned({
        activitySlug: 'running',
        intensity: 'moderate',
        durationMinutes: 0,
        weightKg: 70,
      }),
    ).toBe(0);
    expect(
      activityCaloriesBurned({
        activitySlug: 'running',
        intensity: 'moderate',
        durationMinutes: 30,
        weightKg: 0,
      }),
    ).toBe(0);
  });
});

describe('safeCalorieTarget', () => {
  it('returns TDEE unchanged when maintaining', () => {
    expect(safeCalorieTarget({ tdee: 2400, bmr: 1700, goal: 'maintain', sex: 'male' })).toEqual({
      target: 2400,
      clamped: false,
    });
  });

  it('applies at most a 20% deficit', () => {
    const result = safeCalorieTarget({ tdee: 2000, bmr: 1400, goal: 'lose', sex: 'female' });
    expect(result.target).toBe(1600);
    expect(result.clamped).toBe(false);
    expect(result.target).toBeGreaterThanOrEqual(2000 * 0.8);
  });

  it('never drops a deficit below BMR', () => {
    const result = safeCalorieTarget({ tdee: 1600, bmr: 1450, goal: 'lose', sex: 'female' });
    expect(result.target).toBe(1450);
    expect(result.clamped).toBe(true);
    expect(result.note).toMatch(/clinician/i);
  });

  it('never drops below the published floor even when BMR is lower', () => {
    const female = safeCalorieTarget({ tdee: 1300, bmr: 1000, goal: 'lose', sex: 'female' });
    expect(female.target).toBe(1200);
    expect(female.clamped).toBe(true);

    const male = safeCalorieTarget({ tdee: 1700, bmr: 1100, goal: 'lose', sex: 'male' });
    expect(male.target).toBe(1500);
    expect(male.clamped).toBe(true);
  });

  it('applies a bounded surplus when gaining', () => {
    const result = safeCalorieTarget({ tdee: 2000, bmr: 1500, goal: 'gain', sex: 'male' });
    expect(result.target).toBe(2400);
  });
});

describe('stepsToCalories', () => {
  it('estimates burn from step count and body mass', () => {
    // 10 000 steps ≈ 100 min at 2.8 MET for a 70 kg person.
    expect(stepsToCalories(10_000, 70)).toBe(343);
  });

  it('returns zero for empty or invalid input', () => {
    expect(stepsToCalories(0, 70)).toBe(0);
    expect(stepsToCalories(5000, 0)).toBe(0);
  });
});
