'use client';

import { BadgeCheck, Loader2, Search, Users } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';

import { logMeal } from '@/app/actions/logs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import type { RecentFood } from '@/lib/queries/recent';
import { cn } from '@/lib/utils';
import {
  MEAL_TYPES,
  scaleNutrition,
  type FoodSearchResponse,
  type FoodSearchResult,
  type LogOutcome,
  type MealType,
} from '@tmh/shared';

/** Guess the meal from the time of day so the field is usually already right. */
function defaultMealType(timezone: string): MealType {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
      new Date(),
    ),
  );
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export function FoodSheet({
  open,
  onClose,
  onLogged,
  recentFoods,
  timezone,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: (outcome: LogOutcome) => void;
  recentFoods: RecentFood[];
  timezone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [mealType, setMealType] = useState<MealType>(() => defaultMealType(timezone));
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<FoodSearchResponse | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Whether a query is long enough to search. Derived rather than stored, so
  // clearing the box needs no state update — the stale response is simply not
  // rendered, which also keeps setState out of the effect body.
  const hasQuery = query.trim().length >= 2;

  // Debounced search. The previous request is aborted so a slow response for
  // an old query cannot overwrite a newer one.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      setSearching(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/food/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<FoodSearchResponse>) : null))
        .then((data) => {
          if (data) setResponse(data);
        })
        .catch(() => {
          /* Aborted or offline; the empty state covers it. */
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const logRecent = (food: RecentFood) => {
    setBusyKey(`recent:${food.name}:${food.brand ?? ''}`);
    startTransition(async () => {
      const outcome = await logMeal({
        mealType,
        name: food.name,
        ...(food.brand ? { brand: food.brand } : {}),
        foodSource: food.foodSource,
        ...(food.externalId ? { externalId: food.externalId } : {}),
        quantity: food.quantity,
        unit: food.unit,
        calories: food.calories,
        proteinG: food.proteinG,
        carbsG: food.carbsG,
        fatG: food.fatG,
        fiberG: food.fiberG,
        sugarG: food.sugarG,
        sodiumMg: food.sodiumMg,
      });
      setBusyKey(null);
      onLogged(outcome);
    });
  };

  /** Catalogue rows are per 100 g; log a 100 g serving and let the user edit later. */
  const logSearchResult = (result: FoodSearchResult) => {
    setBusyKey(`search:${result.source}:${result.id}`);
    const grams = result.serving?.grams ?? 100;
    const multiplier = grams / 100;
    const scaled = scaleNutrition(result.nutrition, multiplier);

    startTransition(async () => {
      const outcome = await logMeal({
        mealType,
        name: result.name,
        ...(result.brand ? { brand: result.brand } : {}),
        foodSource: result.source,
        externalId: result.id,
        ...(result.source === 'open_food_facts' ? { barcode: result.id } : {}),
        quantity: grams,
        unit: 'g',
        calories: scaled.calories,
        proteinG: scaled.proteinG,
        carbsG: scaled.carbsG,
        fatG: scaled.fatG,
        fiberG: scaled.fiberG,
        sugarG: scaled.sugarG,
        sodiumMg: scaled.sodiumMg,
      });
      setBusyKey(null);
      setQuery('');
      setResponse(null);
      onLogged(outcome);
    });
  };

  // Gated on hasQuery so a stale response never shows under a cleared box.
  const results = hasQuery ? (response?.results ?? []) : [];
  const degraded = response?.degraded ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log food"
      description={`Added to ${mealType}. Tap something you eat often, or search.`}
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="meal-type">Meal</Label>
          <Select
            id="meal-type"
            value={mealType}
            onChange={(event) => setMealType(event.target.value as MealType)}
            className="mt-1.5"
          >
            {MEAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </Select>
        </div>

        {recentFoods.length > 0 && !hasQuery && (
          <section aria-labelledby="recent-foods">
            <h3
              id="recent-foods"
              className="mb-2 text-xs tracking-wide text-muted-foreground uppercase"
            >
              You log these often
            </h3>
            <ul className="flex flex-col gap-1.5">
              {recentFoods.map((food) => {
                const key = `recent:${food.name}:${food.brand ?? ''}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => logRecent(food)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors',
                        'hover:border-energy hover:bg-energy/10 disabled:opacity-60',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{food.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {food.brand ? `${food.brand} · ` : ''}
                          {food.calories} kcal · logged {food.timesLogged}×
                        </span>
                      </span>
                      {busyKey === key && (
                        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-energy" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div>
          <Label htmlFor="food-search">Search foods</Label>
          <div className="relative mt-1.5">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="food-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Banana, Greek yoghurt…"
              className="pl-9"
              autoComplete="off"
            />
            {searching && (
              <Loader2
                aria-hidden
                className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              />
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Only your search term is sent — never your logs or profile.
          </p>
        </div>

        {degraded.length > 0 && (
          <p role="status" className="text-xs text-warning">
            {degraded
              .map((entry) => `${entry.source.replace(/_/g, ' ')} ${entry.reason}`)
              .join('; ')}
            . Showing what we could reach.
          </p>
        )}

        {hasQuery && !searching && results.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nothing found for “{query.trim()}”.
          </p>
        )}

        {results.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {results.map((result) => {
              const key = `search:${result.source}:${result.id}`;
              const grams = result.serving?.grams ?? 100;
              const portion = result.serving?.label ?? '100 g';
              const kcal = Math.round((result.nutrition.calories * grams) / 100);
              return (
                <li key={key}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => logSearchResult(result)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors',
                      'hover:border-energy hover:bg-energy/10 disabled:opacity-60',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{result.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.brand ? `${result.brand} · ` : ''}
                        {kcal} kcal per {portion}
                      </span>
                    </span>

                    {/* Provenance on every row — RESEARCH.md D2. */}
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
                        result.verified
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                      title={
                        result.verified
                          ? 'Laboratory-analysed USDA data'
                          : 'Crowdsourced — check the numbers'
                      }
                    >
                      {result.verified ? (
                        <BadgeCheck aria-hidden className="size-3" />
                      ) : (
                        <Users aria-hidden className="size-3" />
                      )}
                      {result.verified ? 'Verified' : 'Community'}
                    </span>

                    {busyKey === key && (
                      <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-energy" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
