import { describe, expect, it } from 'vitest';

import { normalizeOffProduct, normalizeUsdaFood, rankResults } from './normalize';
import type { FoodSearchResult } from './types';

describe('normalizeUsdaFood', () => {
  it('reads nutrients from the legacy NDB numbering the search endpoint returns', () => {
    // /foods/search reports nutrientNumber in the old NDB scheme ("208" for
    // energy) alongside the modern nutrientId (1008). Matching only the
    // modern scheme silently zeroed every nutrient.
    const result = normalizeUsdaFood({
      fdcId: 173944,
      description: 'BANANA, RAW',
      dataType: 'SR Legacy',
      foodNutrients: [
        { nutrientId: 1008, nutrientNumber: '208', value: 89 },
        { nutrientId: 1003, nutrientNumber: '203', value: 1.09 },
        { nutrientId: 1005, nutrientNumber: '205', value: 22.84 },
        { nutrientId: 1004, nutrientNumber: '204', value: 0.33 },
        { nutrientId: 1079, nutrientNumber: '291', value: 2.6 },
        { nutrientId: 2000, nutrientNumber: '269', value: 12.23 },
        { nutrientId: 1093, nutrientNumber: '307', value: 1 },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.nutrition).toEqual({
      calories: 89,
      proteinG: 1.1,
      carbsG: 22.8,
      fatG: 0.3,
      fiberG: 2.6,
      sugarG: 12.2,
      sodiumMg: 1,
    });
  });

  it('also reads the modern nutrientId scheme on its own', () => {
    const result = normalizeUsdaFood({
      fdcId: 1,
      description: 'Oats',
      dataType: 'Foundation',
      foodNutrients: [{ nutrientId: 1008, value: 379 }],
    });
    expect(result?.nutrition.calories).toBe(379);
  });

  it('accepts `amount` where an endpoint uses it instead of `value`', () => {
    const result = normalizeUsdaFood({
      fdcId: 2,
      description: 'Rice',
      dataType: 'Foundation',
      foodNutrients: [{ nutrientId: 1008, amount: 130 }],
    });
    expect(result?.nutrition.calories).toBe(130);
  });

  it('makes shouted descriptions readable', () => {
    const result = normalizeUsdaFood({
      fdcId: 1,
      description: 'CHEDDAR CHEESE, SHARP',
      dataType: 'SR Legacy',
    });
    expect(result?.name).toBe('Cheddar cheese, sharp');
  });

  it('leaves mixed-case names alone', () => {
    const result = normalizeUsdaFood({
      fdcId: 2,
      description: 'Greek yoghurt',
      dataType: 'Branded',
    });
    expect(result?.name).toBe('Greek yoghurt');
  });

  it('marks laboratory data verified and branded data not', () => {
    expect(
      normalizeUsdaFood({ fdcId: 3, description: 'Oats', dataType: 'Foundation' })?.verified,
    ).toBe(true);
    expect(
      normalizeUsdaFood({ fdcId: 4, description: 'Oats', dataType: 'Branded' })?.verified,
    ).toBe(false);
  });

  it('exposes a portion weight as a serving shortcut', () => {
    const result = normalizeUsdaFood({
      fdcId: 5,
      description: 'Cereal',
      dataType: 'Branded',
      servingSize: 40,
      servingSizeUnit: 'g',
      householdServingFullText: '1 cup',
    });
    expect(result?.serving).toEqual({ grams: 40, label: '1 cup' });
  });

  it('ignores a serving size that is not in grams', () => {
    const result = normalizeUsdaFood({
      fdcId: 6,
      description: 'Juice',
      dataType: 'Branded',
      servingSize: 240,
      servingSizeUnit: 'ml',
    });
    expect(result?.serving).toBeUndefined();
  });

  it('returns null rather than a nameless row', () => {
    expect(normalizeUsdaFood({ fdcId: 7 })).toBeNull();
    expect(normalizeUsdaFood({ description: 'No id' })).toBeNull();
  });

  it('treats missing nutrients as zero instead of NaN', () => {
    const result = normalizeUsdaFood({ fdcId: 8, description: 'Sparse', dataType: 'Foundation' });
    expect(result?.nutrition.calories).toBe(0);
    expect(Number.isNaN(result?.nutrition.proteinG)).toBe(false);
  });
});

describe('normalizeOffProduct', () => {
  it('reads per-100g values and converts sodium from grams', () => {
    const result = normalizeOffProduct({
      code: '3017620422003',
      product_name: 'Nutella',
      brands: 'Ferrero, Nutella',
      nutriments: {
        'energy-kcal_100g': 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        fiber_100g: 0,
        sugars_100g: 56.3,
        sodium_100g: 0.0417,
      },
    });

    expect(result?.nutrition.calories).toBe(539);
    expect(result?.nutrition.sodiumMg).toBe(42);
    expect(result?.brand).toBe('Ferrero');
    expect(result?.verified).toBe(false);
  });

  it('falls back to kilojoules rather than reporting zero calories', () => {
    const result = normalizeOffProduct({
      code: '123456',
      product_name: 'Mystery bar',
      nutriments: { energy_100g: 2000 },
    });
    // 2000 kJ / 4.184
    expect(result?.nutrition.calories).toBe(478);
  });

  it('accepts numeric strings, which the API sometimes returns', () => {
    const result = normalizeOffProduct({
      code: '999',
      product_name: 'Stringy',
      nutriments: { 'energy-kcal_100g': '250', proteins_100g: '9.5' },
    });
    expect(result?.nutrition.calories).toBe(250);
    expect(result?.nutrition.proteinG).toBe(9.5);
  });

  it('prefers the English name when present', () => {
    const result = normalizeOffProduct({
      code: '111',
      product_name: 'Lait demi-écrémé',
      product_name_en: 'Semi-skimmed milk',
    });
    expect(result?.name).toBe('Semi-skimmed milk');
  });

  it('returns null without a code or a name', () => {
    expect(normalizeOffProduct({ product_name: 'No code' })).toBeNull();
    expect(normalizeOffProduct({ code: '123' })).toBeNull();
  });
});

describe('rankResults', () => {
  const make = (over: Partial<FoodSearchResult>): FoodSearchResult => ({
    id: over.id ?? '1',
    source: over.source ?? 'usda',
    name: over.name ?? 'Food',
    verified: over.verified ?? false,
    basis: { label: '100 g', grams: 100 },
    nutrition: {
      calories: over.nutrition?.calories ?? 100,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    },
  });

  it('puts verified data first among equally usable rows — RESEARCH.md D2', () => {
    const ranked = rankResults([
      make({ id: 'crowd', verified: false, name: 'Banana' }),
      make({ id: 'usda', verified: true, name: 'Banana, raw, quite a long name' }),
    ]);
    expect(ranked[0]?.id).toBe('usda');
  });

  it('demotes entries with no energy data', () => {
    const ranked = rankResults([
      make({ id: 'empty', verified: true, nutrition: { calories: 0 } as never }),
      make({ id: 'real', verified: true, nutrition: { calories: 89 } as never }),
    ]);
    expect(ranked[0]?.id).toBe('real');
  });

  it('prefers a usable crowd row over a verified row with no calories', () => {
    // A verified row that cannot be logged is worse than a crowd row that can.
    const ranked = rankResults([
      make({ id: 'verified-empty', verified: true, nutrition: { calories: 0 } as never }),
      make({ id: 'crowd-usable', verified: false, nutrition: { calories: 89 } as never }),
    ]);
    expect(ranked[0]?.id).toBe('crowd-usable');
  });

  it('prefers the more specific (shorter) name at equal quality', () => {
    const ranked = rankResults([
      make({ id: 'long', name: 'Banana, raw, organic, fair trade, imported' }),
      make({ id: 'short', name: 'Banana, raw' }),
    ]);
    expect(ranked[0]?.id).toBe('short');
  });

  it('does not mutate its input', () => {
    const input = [make({ id: 'a', verified: false }), make({ id: 'b', verified: true })];
    rankResults(input);
    expect(input[0]?.id).toBe('a');
  });
});
