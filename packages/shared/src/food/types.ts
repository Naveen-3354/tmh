import type { NutritionFacts } from '../calc/macros';

export type FoodCatalogue = 'usda' | 'open_food_facts';

/**
 * One food from a catalogue lookup.
 *
 * `basis` says what the numbers describe — a named serving or 100 g — because
 * silently mixing the two is how tracking apps end up with wildly wrong
 * calorie counts, which is the single most common complaint in RESEARCH.md.
 */
export interface FoodSearchResult {
  /** Stable within its catalogue: FDC id, or an Open Food Facts barcode. */
  id: string;
  source: FoodCatalogue;
  name: string;
  brand?: string;
  /** True for staff-verified data. Drives ranking and the UI badge. */
  verified: boolean;
  basis: {
    label: string;
    grams?: number;
  };
  /** A known portion, offered as a one-tap quantity shortcut when available. */
  serving?: {
    grams: number;
    label: string;
  };
  nutrition: NutritionFacts;
}

export interface FoodSearchResponse {
  results: FoodSearchResult[];
  /** Catalogues that failed or were rate-limited. Surfaced, never hidden. */
  degraded: { source: FoodCatalogue; reason: string }[];
}
