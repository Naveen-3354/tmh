/**
 * Seeds the demo account with ~90 days of plausible history.
 *
 *   npm run db:seed
 *
 * Pulled forward from the delivery plan's final phase because a dashboard
 * cannot be reviewed against an empty database.
 *
 * Two properties matter more than volume:
 *
 *   1. It is deterministic. A seeded PRNG means the same command produces the
 *      same history, so a screenshot taken today matches one taken next week
 *      and a regression in a chart is visible rather than lost in noise.
 *   2. It contains a real signal. Short nights are followed by lower mood and
 *      fewer steps, so the correlation insights have something genuine to
 *      find. Seeding pure noise would make that feature look broken.
 *
 * All writes go through withUserContext, so the seed exercises the same RLS
 * path the application uses rather than a privileged shortcut.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTIVITY_TYPES,
  activityCaloriesBurned,
  addDays,
  basalMetabolicRate,
  macroTargets,
  safeCalorieTarget,
  toDayKey,
  totalDailyEnergyExpenditure,
  zonedWallClockToUtc,
  type ActivityIntensity,
  type DayKey,
} from '@tmh/shared';
import { eq, sql } from 'drizzle-orm';

import { closeConnection, withElevatedContext, withUserContext } from './client';
import {
  activityLogs,
  foodEntries,
  goals,
  medicationEvents,
  medications,
  moodLogs,
  profiles,
  sleepLogs,
  stepEntries,
  vitalReadings,
  waterLogs,
} from './schema';

export const DEMO_EMAIL = 'demo@tmh.app';
export const DEMO_PASSWORD = 'demo-tmh-2026';
const DEMO_TIMEZONE = 'Asia/Kolkata';
const DAYS = 90;

// ---------------------------------------------------------------------------
// Deterministic randomness (mulberry32)
// ---------------------------------------------------------------------------

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260811);

const between = (min: number, max: number): number => min + random() * (max - min);
const intBetween = (min: number, max: number): number => Math.round(between(min, max));
const chance = (probability: number): boolean => random() < probability;

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick() called with an empty array');
  return item;
}

// ---------------------------------------------------------------------------
// Food catalogue — plausible per-serving values, roughly USDA-consistent
// ---------------------------------------------------------------------------

interface SeedFood {
  name: string;
  brand?: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
}

const BREAKFASTS: SeedFood[] = [
  {
    name: 'Rolled oats with milk',
    calories: 320,
    proteinG: 13,
    carbsG: 48,
    fatG: 8,
    fiberG: 6,
    sugarG: 12,
    sodiumMg: 120,
  },
  {
    name: 'Masala dosa',
    calories: 385,
    proteinG: 8,
    carbsG: 60,
    fatG: 12,
    fiberG: 4,
    sugarG: 3,
    sodiumMg: 560,
  },
  {
    name: 'Greek yoghurt with berries',
    calories: 210,
    proteinG: 18,
    carbsG: 22,
    fatG: 5,
    fiberG: 3,
    sugarG: 16,
    sodiumMg: 75,
  },
  {
    name: 'Two eggs on toast',
    calories: 340,
    proteinG: 20,
    carbsG: 28,
    fatG: 16,
    fiberG: 3,
    sugarG: 3,
    sodiumMg: 480,
  },
  {
    name: 'Idli with sambar',
    calories: 290,
    proteinG: 10,
    carbsG: 52,
    fatG: 4,
    fiberG: 6,
    sugarG: 4,
    sodiumMg: 610,
  },
];

const LUNCHES: SeedFood[] = [
  {
    name: 'Chicken salad bowl',
    calories: 480,
    proteinG: 38,
    carbsG: 30,
    fatG: 22,
    fiberG: 7,
    sugarG: 8,
    sodiumMg: 720,
  },
  {
    name: 'Rajma chawal',
    calories: 560,
    proteinG: 19,
    carbsG: 92,
    fatG: 11,
    fiberG: 14,
    sugarG: 6,
    sodiumMg: 690,
  },
  {
    name: 'Turkey sandwich',
    calories: 430,
    proteinG: 28,
    carbsG: 44,
    fatG: 14,
    fiberG: 5,
    sugarG: 7,
    sodiumMg: 980,
  },
  {
    name: 'Paneer wrap',
    calories: 520,
    proteinG: 22,
    carbsG: 51,
    fatG: 24,
    fiberG: 6,
    sugarG: 5,
    sodiumMg: 830,
  },
  {
    name: 'Lentil soup and bread',
    calories: 395,
    proteinG: 18,
    carbsG: 58,
    fatG: 8,
    fiberG: 12,
    sugarG: 6,
    sodiumMg: 750,
  },
];

const DINNERS: SeedFood[] = [
  {
    name: 'Grilled salmon with rice',
    calories: 610,
    proteinG: 42,
    carbsG: 55,
    fatG: 22,
    fiberG: 3,
    sugarG: 2,
    sodiumMg: 540,
  },
  {
    name: 'Chicken curry with roti',
    calories: 650,
    proteinG: 36,
    carbsG: 62,
    fatG: 26,
    fiberG: 8,
    sugarG: 7,
    sodiumMg: 880,
  },
  {
    name: 'Vegetable stir fry with tofu',
    calories: 470,
    proteinG: 24,
    carbsG: 46,
    fatG: 19,
    fiberG: 9,
    sugarG: 11,
    sodiumMg: 760,
  },
  {
    name: 'Pasta with tomato sauce',
    calories: 580,
    proteinG: 19,
    carbsG: 88,
    fatG: 16,
    fiberG: 7,
    sugarG: 12,
    sodiumMg: 640,
  },
  {
    name: 'Khichdi with curd',
    calories: 490,
    proteinG: 17,
    carbsG: 74,
    fatG: 13,
    fiberG: 8,
    sugarG: 5,
    sodiumMg: 520,
  },
];

const SNACKS: SeedFood[] = [
  {
    name: 'Banana',
    calories: 105,
    proteinG: 1.3,
    carbsG: 27,
    fatG: 0.4,
    fiberG: 3,
    sugarG: 14,
    sodiumMg: 1,
  },
  {
    name: 'Almonds, 30 g',
    calories: 174,
    proteinG: 6.4,
    carbsG: 6,
    fatG: 15,
    fiberG: 3.5,
    sugarG: 1.2,
    sodiumMg: 0,
  },
  {
    name: 'Filter coffee',
    calories: 60,
    proteinG: 2,
    carbsG: 8,
    fatG: 2,
    fiberG: 0,
    sugarG: 7,
    sodiumMg: 40,
  },
  {
    name: 'Protein shake',
    brand: 'Generic',
    calories: 160,
    proteinG: 27,
    carbsG: 6,
    fatG: 2.5,
    fiberG: 1,
    sugarG: 2,
    sodiumMg: 190,
  },
  {
    name: 'Dark chocolate, 2 squares',
    calories: 110,
    proteinG: 1.4,
    carbsG: 11,
    fatG: 7.5,
    fiberG: 2,
    sugarG: 7,
    sodiumMg: 3,
  },
];

const MOOD_TAGS = ['energised', 'focused', 'tired', 'headache', 'stressed', 'sore', 'calm'];

// ---------------------------------------------------------------------------
// Account provisioning
// ---------------------------------------------------------------------------

function loadLocalEnv(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'apps',
    'web',
    '.env.local',
  );
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of contents.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || process.env[key]) continue;
    process.env[key] = (rawValue ?? '').replace(/^["']|["']$/g, '');
  }
}

/**
 * Finds or creates the demo auth user and returns its id.
 *
 * Writes directly to `auth.users` because the admin API needs a service-role
 * key, which this project deliberately never holds. The password is hashed
 * with bcrypt via pgcrypto, exactly as Supabase's own signup does.
 *
 * Two details are easy to miss and both produce the same opaque
 * "Database error querying schema" at sign-in:
 *
 *   1. GoTrue scans the various *_token columns into non-nullable Go strings,
 *      so they must be '' rather than NULL.
 *   2. Email/password auth requires a matching row in `auth.identities`; a
 *      user without one exists but cannot authenticate.
 */
async function ensureDemoUser(): Promise<{ userId: string; created: boolean }> {
  return withElevatedContext(async (db) => {
    const existing = await db.execute<{ id: string }>(
      sql`select id from auth.users where email = ${DEMO_EMAIL} limit 1`,
    );

    let userId = existing[0]?.id;
    const created = !userId;

    if (!userId) {
      const inserted = await db.execute<{ id: string }>(sql`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at,
          raw_app_meta_data, raw_user_meta_data,
          confirmation_token, recovery_token,
          email_change, email_change_token_new, email_change_token_current,
          phone_change, phone_change_token, reauthentication_token
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
          'authenticated', ${DEMO_EMAIL},
          extensions.crypt(${DEMO_PASSWORD}, extensions.gen_salt('bf')),
          now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"full_name":"Demo User"}'::jsonb,
          '', '', '', '', '', '', '', ''
        )
        returning id
      `);
      userId = inserted[0]?.id;
      if (!userId) throw new Error('Failed to create the demo auth user.');
    } else {
      // Re-running the seed should also repair a user created by an older
      // version of this script, and reset the password to the documented one.
      await db.execute(sql`
        update auth.users set
          encrypted_password = extensions.crypt(${DEMO_PASSWORD}, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          confirmation_token = coalesce(confirmation_token, ''),
          recovery_token = coalesce(recovery_token, ''),
          email_change = coalesce(email_change, ''),
          email_change_token_new = coalesce(email_change_token_new, ''),
          email_change_token_current = coalesce(email_change_token_current, ''),
          phone_change = coalesce(phone_change, ''),
          phone_change_token = coalesce(phone_change_token, ''),
          reauthentication_token = coalesce(reauthentication_token, ''),
          updated_at = now()
        where id = ${userId}::uuid
      `);
    }

    // `email` on this table is GENERATED ALWAYS from identity_data->>'email',
    // so it must not be listed. The conflict target matches the unique index
    // (provider_id, provider) in that order.
    await db.execute(sql`
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), ${userId}::uuid,
        jsonb_build_object('sub', ${userId}::text, 'email', ${DEMO_EMAIL}::text, 'email_verified', true),
        'email', ${userId}::text,
        now(), now(), now()
      )
      on conflict (provider_id, provider) do nothing
    `);

    return { userId, created };
  });
}

/** Removes every log row for the demo user so re-seeding is idempotent. */
async function clearExistingData(userId: string): Promise<void> {
  await withUserContext(userId, async (db) => {
    await db.delete(medicationEvents);
    await db.delete(medications);
    await db.delete(moodLogs);
    await db.delete(vitalReadings);
    await db.delete(waterLogs);
    await db.delete(sleepLogs);
    await db.delete(foodEntries);
    await db.delete(stepEntries);
    await db.delete(activityLogs);
  });
}

// ---------------------------------------------------------------------------
// History generation
// ---------------------------------------------------------------------------

interface DayPlan {
  day: DayKey;
  sleepMinutes: number;
  sleepQuality: number;
  mood: number;
  steps: number;
  trained: boolean;
}

/**
 * Builds the day-by-day plan first, so the correlations are deliberate.
 *
 * Sleep is the driver: a short night lowers mood and step count the following
 * day. This is the pattern the insights engine is meant to surface.
 */
function planDays(today: DayKey): DayPlan[] {
  const plans: DayPlan[] = [];
  let previousSleepMinutes = 450;

  for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
    const day = addDays(today, -offset);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    // Occasional genuinely short nights, more likely midweek.
    const shortNight = chance(isWeekend ? 0.08 : 0.22);
    const sleepMinutes = shortNight ? intBetween(280, 355) : intBetween(400, isWeekend ? 540 : 495);

    const sleepDeficit = Math.max(0, 420 - previousSleepMinutes) / 60;

    const mood = Math.min(
      5,
      Math.max(1, Math.round(between(3.4, 4.6) - sleepDeficit * 0.9 + (isWeekend ? 0.3 : 0))),
    );

    const steps = Math.max(
      1200,
      Math.round((isWeekend ? between(5000, 12000) : between(6000, 13500)) - sleepDeficit * 1100),
    );

    plans.push({
      day,
      sleepMinutes,
      sleepQuality: Math.min(5, Math.max(1, Math.round(sleepMinutes / 110))),
      mood,
      steps,
      trained: chance(isWeekend ? 0.5 : 0.42) && sleepDeficit < 1.5,
    });

    previousSleepMinutes = sleepMinutes;
  }

  return plans;
}

function at(day: DayKey, hour: number, minute = 0): Date {
  return zonedWallClockToUtc(day, DEMO_TIMEZONE, hour, minute);
}

async function seedHistory(userId: string, today: DayKey): Promise<Record<string, number>> {
  const plans = planDays(today);
  const counts: Record<string, number> = {};

  // Weight drifts gently downward with day-to-day noise, as a real scale does.
  let weightKg = 78.5;

  const activityRows: (typeof activityLogs.$inferInsert)[] = [];
  const stepRows: (typeof stepEntries.$inferInsert)[] = [];
  const foodRows: (typeof foodEntries.$inferInsert)[] = [];
  const sleepRows: (typeof sleepLogs.$inferInsert)[] = [];
  const waterRows: (typeof waterLogs.$inferInsert)[] = [];
  const vitalRows: (typeof vitalReadings.$inferInsert)[] = [];
  const moodRows: (typeof moodLogs.$inferInsert)[] = [];

  for (const plan of plans) {
    const isToday = plan.day === today;

    stepRows.push({ userId, day: plan.day, steps: plan.steps, source: 'demo' });

    // Sleep is recorded against the morning you woke up.
    const wake = at(plan.day, 6, intBetween(0, 59));
    sleepRows.push({
      userId,
      bedtime: new Date(wake.getTime() - plan.sleepMinutes * 60_000),
      wakeTime: wake,
      durationMinutes: plan.sleepMinutes,
      quality: plan.sleepQuality,
      source: 'demo',
    });

    if (plan.trained) {
      const activity = pick(ACTIVITY_TYPES.filter((a) => a.category !== 'lifestyle'));
      const intensity: ActivityIntensity = pick(['light', 'moderate', 'moderate', 'vigorous']);
      const durationMinutes = intBetween(25, 75);
      activityRows.push({
        userId,
        occurredAt: at(plan.day, intBetween(7, 19), intBetween(0, 59)),
        activitySlug: activity.slug,
        intensity,
        durationMinutes,
        caloriesBurned: activityCaloriesBurned({
          activitySlug: activity.slug,
          intensity,
          durationMinutes,
          weightKg,
        }),
        source: 'demo',
      });
    }

    // Meals. "Today" is only partially logged, which is what a real day looks
    // like mid-afternoon and gives the empty-state affordances something to do.
    const meals: [typeof BREAKFASTS, 'breakfast' | 'lunch' | 'dinner' | 'snack', number][] = [
      [BREAKFASTS, 'breakfast', 8],
      [LUNCHES, 'lunch', 13],
      [DINNERS, 'dinner', 20],
    ];
    for (const [catalogue, mealType, hour] of meals) {
      if (isToday && hour > 14) continue;
      const food = pick(catalogue);
      foodRows.push({
        userId,
        occurredAt: at(plan.day, hour, intBetween(0, 45)),
        mealType,
        name: food.name,
        brand: food.brand ?? null,
        foodSource: 'usda',
        quantity: 1,
        unit: 'serving',
        calories: food.calories,
        proteinG: food.proteinG,
        carbsG: food.carbsG,
        fatG: food.fatG,
        fiberG: food.fiberG,
        sugarG: food.sugarG,
        sodiumMg: food.sodiumMg,
        source: 'demo',
      });
    }
    if (chance(0.7)) {
      const snack = pick(SNACKS);
      foodRows.push({
        userId,
        occurredAt: at(plan.day, intBetween(10, 17), intBetween(0, 59)),
        mealType: 'snack',
        name: snack.name,
        brand: snack.brand ?? null,
        foodSource: 'open_food_facts',
        quantity: 1,
        unit: 'serving',
        calories: snack.calories,
        proteinG: snack.proteinG,
        carbsG: snack.carbsG,
        fatG: snack.fatG,
        fiberG: snack.fiberG,
        sugarG: snack.sugarG,
        sodiumMg: snack.sodiumMg,
        source: 'demo',
      });
    }

    // Water, in the sizes the quick-add buttons offer.
    const glasses = intBetween(4, 9);
    for (let index = 0; index < glasses; index += 1) {
      const hour = 7 + Math.floor((index / glasses) * 14);
      if (isToday && hour > 14) continue;
      waterRows.push({
        userId,
        occurredAt: at(plan.day, hour, intBetween(0, 55)),
        amountMl: pick([250, 250, 300, 500]),
        source: 'demo',
      });
    }

    moodRows.push({
      userId,
      occurredAt: at(plan.day, intBetween(19, 22), intBetween(0, 59)),
      score: plan.mood,
      note: plan.mood <= 2 ? 'Ran on very little sleep.' : null,
      tags: chance(0.45) ? [pick(MOOD_TAGS)] : [],
      source: 'demo',
    });

    // Weigh-ins a few times a week, not daily.
    weightKg = Math.max(70, weightKg - between(0.005, 0.045) + between(-0.25, 0.25));
    if (chance(0.4)) {
      vitalRows.push({
        userId,
        occurredAt: at(plan.day, 7, intBetween(0, 30)),
        type: 'weight',
        value: Math.round(weightKg * 10) / 10,
        source: 'demo',
      });
    }
    if (chance(0.3)) {
      vitalRows.push({
        userId,
        occurredAt: at(plan.day, 7, intBetween(0, 30)),
        type: 'resting_heart_rate',
        value: intBetween(52, 68),
        source: 'demo',
      });
    }
    if (chance(0.12)) {
      vitalRows.push({
        userId,
        occurredAt: at(plan.day, intBetween(8, 20)),
        type: 'blood_pressure',
        value: intBetween(112, 128),
        secondaryValue: intBetween(70, 84),
        source: 'demo',
      });
    }
  }

  await withUserContext(userId, async (db) => {
    // Chunked: a single 90-day multi-insert can exceed the parameter limit.
    const insertAll = async <T>(
      table: Parameters<typeof db.insert>[0],
      rows: T[],
      label: string,
    ) => {
      for (let index = 0; index < rows.length; index += 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(table).values(rows.slice(index, index + 200) as any);
      }
      counts[label] = rows.length;
    };

    await insertAll(stepEntries, stepRows, 'step entries');
    await insertAll(sleepLogs, sleepRows, 'sleep logs');
    await insertAll(activityLogs, activityRows, 'activity logs');
    await insertAll(foodEntries, foodRows, 'food entries');
    await insertAll(waterLogs, waterRows, 'water logs');
    await insertAll(vitalReadings, vitalRows, 'vital readings');
    await insertAll(moodLogs, moodRows, 'mood logs');

    // A medication with a month of adherence history, mostly taken.
    const [vitaminD] = await db
      .insert(medications)
      .values({
        userId,
        name: 'Vitamin D3',
        dosage: '1000 IU',
        scheduleTimes: ['09:00'],
        active: true,
        startedOn: addDays(today, -DAYS + 1),
        notes: 'With breakfast.',
      })
      .returning({ id: medications.id });

    if (vitaminD) {
      const events = plans.slice(-30).map((plan) => ({
        userId,
        medicationId: vitaminD.id,
        scheduledFor: at(plan.day, 9),
        status: chance(0.88) ? ('taken' as const) : ('skipped' as const),
        recordedAt: at(plan.day, 9, intBetween(1, 90)),
        source: 'demo' as const,
      }));
      await db.insert(medicationEvents).values(events);
      counts['medication events'] = events.length;
      counts['medications'] = 1;
    }
  });

  return counts;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadLocalEnv();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. See apps/web/.env.local.');
    process.exit(1);
  }

  const { userId, created } = await ensureDemoUser();
  console.log(`Demo user ${created ? 'created' : 'found'}: ${DEMO_EMAIL} (${userId})`);

  const today = toDayKey(new Date(), DEMO_TIMEZONE);

  await clearExistingData(userId);

  // Profile and goals, derived exactly as onboarding would derive them.
  const heightCm = 178;
  const startingWeightKg = 78.5;
  const bmr = basalMetabolicRate({
    weightKg: startingWeightKg,
    heightCm,
    ageYears: 34,
    sex: 'male',
  });
  const tdee = totalDailyEnergyExpenditure(bmr, 'moderately_active');
  const calories = safeCalorieTarget({ tdee, bmr, goal: 'lose', sex: 'male' });
  const macros = macroTargets(calories.target);

  await withUserContext(userId, async (db) => {
    await db.update(profiles).set({
      displayName: 'Demo',
      email: DEMO_EMAIL,
      birthDate: addDays(today, -34 * 365 - 80),
      sex: 'male',
      heightCm,
      timezone: DEMO_TIMEZONE,
      unitSystem: 'metric',
      activityLevel: 'moderately_active',
      weightGoal: 'lose',
      onboardingCompletedAt: new Date(),
      isDemo: true,
    });

    await db
      .update(goals)
      .set({
        calorieTarget: calories.target,
        proteinTargetG: macros.proteinG,
        carbsTargetG: macros.carbsG,
        fatTargetG: macros.fatG,
        waterTargetMl: 2500,
        sleepTargetMinutes: 450,
        stepsTarget: 9000,
        activeMinutesTarget: 35,
      })
      .where(eq(goals.userId, userId));
  });

  const counts = await seedHistory(userId, today);

  console.log(`\nSeeded ${DAYS} days ending ${today} (${DEMO_TIMEZONE}):`);
  for (const [label, count] of Object.entries(counts)) {
    console.log(`  ${String(count).padStart(4)}  ${label}`);
  }
  console.log(`\nDaily calorie target: ${calories.target} kcal`);
  console.log(`Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);

  await closeConnection();
}

main().catch(async (error: unknown) => {
  // Drizzle reports "Failed query: ..." and puts the actual Postgres error on
  // `cause`. Printing only the message hides the one useful line.
  const cause = (error as { cause?: { message?: string; code?: string; detail?: string } }).cause;
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  if (cause) {
    console.error('  cause  :', cause.message);
    console.error('  code   :', cause.code);
    if (cause.detail) console.error('  detail :', cause.detail);
  }
  await closeConnection();
  process.exit(1);
});
