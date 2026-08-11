'use server';

import { goals, profiles, vitalReadings, waterLogs } from '@tmh/db';
import {
  ageInYears,
  basalMetabolicRate,
  macroTargets,
  onboardingSchema,
  safeCalorieTarget,
  toDayKey,
  totalDailyEnergyExpenditure,
} from '@tmh/shared';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { queryAsUser } from '@/lib/auth';

export interface OnboardingState {
  status: 'idle' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
}

const payloadSchema = onboardingSchema.extend({
  /** Optional first log, so the dashboard is never empty on arrival. */
  firstWaterMl: z.number().int().min(0).max(5000).optional(),
});

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const raw = {
    displayName: formData.get('displayName'),
    birthDate: formData.get('birthDate'),
    sex: formData.get('sex'),
    heightCm: Number(formData.get('heightCm')),
    weightKg: Number(formData.get('weightKg')),
    timezone: formData.get('timezone'),
    unitSystem: formData.get('unitSystem'),
    activityLevel: formData.get('activityLevel'),
    weightGoal: formData.get('weightGoal'),
    firstWaterMl: formData.get('firstWaterMl') ? Number(formData.get('firstWaterMl')) : undefined,
  };

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors };
  }

  const input = parsed.data;

  // Targets are derived, never taken from the form. safeCalorieTarget caps the
  // adjustment and refuses to go below BMR or the published floor.
  const bmr = basalMetabolicRate({
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    // Age is measured against the user's local today, so someone whose
    // birthday is "today" in Auckland is not a year younger to the server.
    ageYears: ageInYears(input.birthDate, toDayKey(new Date(), input.timezone)),
    sex: input.sex,
  });
  const tdee = totalDailyEnergyExpenditure(bmr, input.activityLevel);
  const calories = safeCalorieTarget({ tdee, bmr, goal: input.weightGoal, sex: input.sex });
  const macros = macroTargets(calories.target);

  try {
    await queryAsUser(async (db) => {
      const [profile] = await db
        .update(profiles)
        .set({
          displayName: input.displayName,
          birthDate: input.birthDate,
          sex: input.sex,
          heightCm: input.heightCm,
          timezone: input.timezone,
          unitSystem: input.unitSystem,
          activityLevel: input.activityLevel,
          weightGoal: input.weightGoal,
          onboardingCompletedAt: new Date(),
        })
        .returning({ id: profiles.id });

      if (!profile) {
        throw new Error('Profile row missing for the signed-in user.');
      }

      await db
        .update(goals)
        .set({
          calorieTarget: calories.target,
          proteinTargetG: macros.proteinG,
          carbsTargetG: macros.carbsG,
          fatTargetG: macros.fatG,
        })
        .where(eq(goals.userId, profile.id));

      // Starting weight becomes the first point on the weight chart.
      await db.insert(vitalReadings).values({
        userId: profile.id,
        occurredAt: new Date(),
        type: 'weight',
        value: input.weightKg,
        source: 'manual',
      });

      if (input.firstWaterMl && input.firstWaterMl > 0) {
        await db.insert(waterLogs).values({
          userId: profile.id,
          occurredAt: new Date(),
          amountMl: input.firstWaterMl,
          source: 'manual',
        });
      }
    });
  } catch (error) {
    console.error('Onboarding failed', error);
    return {
      status: 'error',
      message: 'Could not save your profile. Please try again.',
    };
  }

  revalidatePath('/today');
  redirect('/today');
}
