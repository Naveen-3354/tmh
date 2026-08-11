/**
 * Food catalogue lookups.
 *
 * Privacy boundary (brief §8): these requests carry a **query term or a
 * barcode and nothing else**. No user id, no profile, no log history, no
 * authentication header — the catalogues cannot tell one user from another.
 *
 * Both sources are optional. If one is rate-limited or down, its failure is
 * reported in `degraded` and the other's results are still returned, because a
 * half-populated search is far more useful than an error page.
 */

import {
  normalizeOffProduct,
  normalizeUsdaFood,
  rankResults,
  type OffProduct,
  type UsdaFood,
} from './normalize';
import type { FoodCatalogue, FoodSearchResponse, FoodSearchResult } from './types';

const OFF_BASE = 'https://world.openfoodfacts.org';
const OFF_SEARCH_BASE = 'https://search.openfoodfacts.org';
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

/**
 * USDA's shared demo key. Works without registration but is aggressively rate
 * limited, so it is only a fallback — set USDA_API_KEY (free, instant, from
 * fdc.nal.usda.gov) for real use.
 */
export const USDA_DEMO_KEY = 'DEMO_KEY';

/** Open Food Facts asks API consumers to identify themselves. */
const USER_AGENT = 'tmh-health-tracker/0.1 (https://github.com/Naveen-3354/tmh)';

const DEFAULT_TIMEOUT_MS = 6000;

export interface FoodSearchOptions {
  limit?: number;
  /** Free key from fdc.nal.usda.gov. Without it USDA is simply skipped. */
  usdaApiKey?: string | undefined;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function fetchJson<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (response.status === 429) throw new Error('rate limited');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'timed out';
    return error.message;
  }
  return 'unavailable';
}

async function searchUsda(
  query: string,
  options: Required<Pick<FoodSearchOptions, 'limit' | 'timeoutMs'>> & {
    apiKey: string;
    signal?: AbortSignal;
  },
): Promise<FoodSearchResult[]> {
  const url = new URL(`${USDA_BASE}/foods/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('api_key', options.apiKey);
  url.searchParams.set('pageSize', String(options.limit));
  // Laboratory-analysed data first; Branded is manufacturer-supplied.
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Branded');

  const payload = await fetchJson<{ foods?: UsdaFood[] }>(
    url.toString(),
    options.timeoutMs,
    options.signal,
  );

  return (payload.foods ?? [])
    .map(normalizeUsdaFood)
    .filter((result): result is FoodSearchResult => result !== null);
}

function toResults(products: OffProduct[]): FoodSearchResult[] {
  return products
    .map(normalizeOffProduct)
    .filter((result): result is FoodSearchResult => result !== null);
}

/**
 * Open Food Facts text search.
 *
 * Prefers the dedicated search service; the legacy `cgi/search.pl` endpoint is
 * deprecated and was observed returning 503 intermittently, so it is only a
 * fallback. Note that passing `fields` to the search service silently strips
 * `nutriments`, which is why the full document is requested.
 */
async function searchOpenFoodFacts(
  query: string,
  options: Required<Pick<FoodSearchOptions, 'limit' | 'timeoutMs'>> & { signal?: AbortSignal },
): Promise<FoodSearchResult[]> {
  const primary = new URL(`${OFF_SEARCH_BASE}/search`);
  primary.searchParams.set('q', query);
  primary.searchParams.set('page_size', String(options.limit));

  try {
    const payload = await fetchJson<{ hits?: OffProduct[] }>(
      primary.toString(),
      options.timeoutMs,
      options.signal,
    );
    const results = toResults(payload.hits ?? []);
    if (results.length > 0) return results;
  } catch {
    // Fall through to the legacy endpoint.
  }

  const legacy = new URL(`${OFF_BASE}/cgi/search.pl`);
  legacy.searchParams.set('search_terms', query);
  legacy.searchParams.set('search_simple', '1');
  legacy.searchParams.set('action', 'process');
  legacy.searchParams.set('json', '1');
  legacy.searchParams.set('page_size', String(options.limit));
  legacy.searchParams.set('fields', 'code,product_name,product_name_en,brands,nutriments');

  const payload = await fetchJson<{ products?: OffProduct[] }>(
    legacy.toString(),
    options.timeoutMs,
    options.signal,
  );
  return toResults(payload.products ?? []);
}

/**
 * Search both catalogues in parallel and merge, verified data first.
 *
 * Never throws for a source failure — check `degraded` to tell the user which
 * catalogue is missing.
 */
export async function searchFoods(
  query: string,
  options: FoodSearchOptions = {},
): Promise<FoodSearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { results: [], degraded: [] };

  const limit = options.limit ?? 15;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const degraded: { source: FoodCatalogue; reason: string }[] = [];

  const tasks: Promise<FoodSearchResult[]>[] = [
    searchOpenFoodFacts(trimmed, { limit, timeoutMs, signal: options.signal }).catch(
      (error: unknown) => {
        degraded.push({ source: 'open_food_facts', reason: describeError(error) });
        return [];
      },
    ),
  ];

  // Falls back to the shared demo key so verified data still appears out of
  // the box; a project key just raises the rate limit.
  const usdaApiKey = options.usdaApiKey || USDA_DEMO_KEY;
  tasks.push(
    searchUsda(trimmed, { limit, timeoutMs, apiKey: usdaApiKey, signal: options.signal }).catch(
      (error: unknown) => {
        degraded.push({
          source: 'usda',
          reason:
            usdaApiKey === USDA_DEMO_KEY && describeError(error) === 'rate limited'
              ? 'rate limited (using the shared demo key — set USDA_API_KEY)'
              : describeError(error),
        });
        return [];
      },
    ),
  );

  const settled = await Promise.all(tasks);
  const merged = dedupe(settled.flat());

  return { results: rankResults(merged).slice(0, limit), degraded };
}

/** Barcode lookup. Open Food Facts only — USDA has no barcode index. */
export async function lookupBarcode(
  barcode: string,
  options: Pick<FoodSearchOptions, 'timeoutMs' | 'signal'> = {},
): Promise<FoodSearchResult | null> {
  const clean = barcode.replace(/\D/g, '');
  if (clean.length < 6) return null;

  const url = `${OFF_BASE}/api/v2/product/${clean}.json?fields=code,product_name,product_name_en,brands,nutriments`;

  try {
    const payload = await fetchJson<{ status?: number; product?: OffProduct }>(
      url,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      options.signal,
    );
    if (payload.status !== 1 || !payload.product) return null;
    return normalizeOffProduct(payload.product);
  } catch {
    return null;
  }
}

/** Collapse the same food appearing in both catalogues, keeping the verified one. */
function dedupe(results: FoodSearchResult[]): FoodSearchResult[] {
  const seen = new Map<string, FoodSearchResult>();
  for (const result of results) {
    const key = `${result.name.toLowerCase()}|${(result.brand ?? '').toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || (!existing.verified && result.verified)) {
      seen.set(key, result);
    }
  }
  return [...seen.values()];
}
