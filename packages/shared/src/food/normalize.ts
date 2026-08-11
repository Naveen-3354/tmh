/**
 * Pure normalisers turning catalogue payloads into FoodSearchResult.
 *
 * Kept separate from the fetch calls so they can be unit-tested against
 * recorded payloads without a network.
 */

import { round } from '../units';
import type { FoodSearchResult } from './types';

/**
 * USDA nutrient identifiers.
 *
 * FoodData Central carries two parallel numbering schemes and uses both in the
 * same payload: `nutrientId` is the modern 1xxx scheme, while `nutrientNumber`
 * is the legacy NDB number (energy is 1008 *and* "208"). Matching only one of
 * them silently yields zero for every nutrient, so both are checked.
 */
const USDA_NUTRIENT = {
  energyKcal: { id: 1008, number: '208' },
  protein: { id: 1003, number: '203' },
  fat: { id: 1004, number: '204' },
  carbs: { id: 1005, number: '205' },
  fiber: { id: 1079, number: '291' },
  sugars: { id: 2000, number: '269' },
  sodium: { id: 1093, number: '307' },
} as const;

type UsdaNutrientKey = keyof typeof USDA_NUTRIENT;

export interface UsdaFood {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: {
    nutrientId?: number;
    nutrientNumber?: string;
    value?: number;
    /** Some FDC endpoints name the field `amount` rather than `value`. */
    amount?: number;
    unitName?: string;
  }[];
}

function usdaNutrient(food: UsdaFood, key: UsdaNutrientKey): number {
  const { id, number } = USDA_NUTRIENT[key];
  const match = food.foodNutrients?.find(
    (nutrient) =>
      nutrient.nutrientId === id ||
      (nutrient.nutrientNumber !== undefined &&
        (nutrient.nutrientNumber === number || nutrient.nutrientNumber === String(id))),
  );
  const value = match?.value ?? match?.amount;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * USDA reports per 100 g for Foundation/SR Legacy and per 100 g for Branded
 * too, with `servingSize` describing a portion. We keep the 100 g basis and
 * expose the serving weight so the UI can offer it as a quantity shortcut.
 */
export function normalizeUsdaFood(food: UsdaFood): FoodSearchResult | null {
  const id = food.fdcId;
  const name = food.description?.trim();
  if (!id || !name) return null;

  const brand = (food.brandName ?? food.brandOwner)?.trim();
  const servingGrams =
    food.servingSizeUnit?.toLowerCase() === 'g' && typeof food.servingSize === 'number'
      ? food.servingSize
      : undefined;

  return {
    id: String(id),
    source: 'usda',
    name: toSentenceCase(name),
    ...(brand ? { brand } : {}),
    // Foundation and SR Legacy are laboratory-analysed; Branded is
    // manufacturer-supplied and no better than a label.
    verified: food.dataType !== 'Branded',
    basis: { label: '100 g', grams: 100 },
    // Offered as a one-tap quantity shortcut when the catalogue knows a
    // portion weight, so the user does not have to reason in hundreds of grams.
    ...(servingGrams
      ? {
          serving: {
            grams: servingGrams,
            label: food.householdServingFullText?.trim() || `${servingGrams} g`,
          },
        }
      : {}),
    nutrition: {
      calories: round(usdaNutrient(food, 'energyKcal'), 0),
      proteinG: round(usdaNutrient(food, 'protein'), 1),
      carbsG: round(usdaNutrient(food, 'carbs'), 1),
      fatG: round(usdaNutrient(food, 'fat'), 1),
      fiberG: round(usdaNutrient(food, 'fiber'), 1),
      sugarG: round(usdaNutrient(food, 'sugars'), 1),
      sodiumMg: round(usdaNutrient(food, 'sodium'), 0),
    },
  };
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  /**
   * A comma-separated string from the legacy CGI endpoint, but an array from
   * the newer search service. Both shapes reach this normaliser.
   */
  brands?: string | string[];
  nutriments?: Record<string, unknown>;
}

function firstBrand(brands: string | string[] | undefined): string | undefined {
  if (!brands) return undefined;
  const first = Array.isArray(brands) ? brands[0] : brands.split(',')[0];
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

function offNumber(nutriments: Record<string, unknown> | undefined, key: string): number {
  const value = nutriments?.[key];
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Open Food Facts reports per 100 g under `*_100g`. Energy is sometimes only
 * present in kJ, so fall back and convert rather than showing zero calories.
 */
export function normalizeOffProduct(product: OffProduct): FoodSearchResult | null {
  const code = product.code?.trim();
  const name = (product.product_name_en ?? product.product_name)?.trim();
  if (!code || !name) return null;

  const nutriments = product.nutriments;
  let calories = offNumber(nutriments, 'energy-kcal_100g');
  if (calories === 0) {
    const kj = offNumber(nutriments, 'energy_100g') || offNumber(nutriments, 'energy-kj_100g');
    if (kj > 0) calories = kj / 4.184;
  }

  const brand = firstBrand(product.brands);

  return {
    id: code,
    source: 'open_food_facts',
    name: toSentenceCase(name),
    ...(brand ? { brand } : {}),
    // Crowdsourced. Shown, but ranked below verified data.
    verified: false,
    basis: { label: '100 g', grams: 100 },
    nutrition: {
      calories: round(calories, 0),
      proteinG: round(offNumber(nutriments, 'proteins_100g'), 1),
      carbsG: round(offNumber(nutriments, 'carbohydrates_100g'), 1),
      fatG: round(offNumber(nutriments, 'fat_100g'), 1),
      fiberG: round(offNumber(nutriments, 'fiber_100g'), 1),
      sugarG: round(offNumber(nutriments, 'sugars_100g'), 1),
      // OFF stores sodium in grams.
      sodiumMg: round(offNumber(nutriments, 'sodium_100g') * 1000, 0),
    },
  };
}

/**
 * USDA descriptions are SHOUTED; make them readable without mangling brands.
 *
 * Only the first letter is raised. USDA uses commas for qualifiers — "Banana,
 * raw", "Cheddar cheese, sharp" — so capitalising after each comma would be
 * wrong. Mixed-case input is left untouched.
 */
function toSentenceCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  const lowered = value.toLowerCase();
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/**
 * Rank search results.
 *
 * Energy data comes before provenance: a verified row with no calories cannot
 * be logged, so ranking it above a usable crowdsourced row would defeat the
 * point of the search. Among rows that are equally usable, verified data wins
 * (RESEARCH.md D2), then the shorter name as a rough proxy for specificity —
 * "Banana, raw" beats a 90-character manufacturer string.
 */
export function rankResults(results: FoodSearchResult[]): FoodSearchResult[] {
  return [...results].sort((a, b) => {
    const aHasEnergy = a.nutrition.calories > 0;
    const bHasEnergy = b.nutrition.calories > 0;
    if (aHasEnergy !== bHasEnergy) return aHasEnergy ? -1 : 1;
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return a.name.length - b.name.length;
  });
}
