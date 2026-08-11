'use client';

import {
  ACTIVITY_LEVEL_LABELS,
  ACTIVITY_LEVELS,
  ageInYears,
  basalMetabolicRate,
  isDayKey,
  cmToFeetInches,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  round,
  safeCalorieTarget,
  totalDailyEnergyExpenditure,
  type ActivityLevel,
  type Sex,
  type UnitSystem,
  type WeightGoal,
} from '@tmh/shared';
import { ArrowLeft, ArrowRight, Check, Droplets, Loader2 } from 'lucide-react';
import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { completeOnboarding, type OnboardingState } from './actions';

const INITIAL: OnboardingState = { status: 'idle' };
const STEPS = ['About you', 'Your goals', 'First log'] as const;

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const GOAL_OPTIONS: { value: WeightGoal; label: string; hint: string }[] = [
  { value: 'lose', label: 'Lose weight', hint: 'Gentle deficit' },
  { value: 'maintain', label: 'Maintain', hint: 'Stay where you are' },
  { value: 'gain', label: 'Gain weight', hint: 'Gentle surplus' },
];

const WATER_PRESETS = [250, 500, 750] as const;

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="flex-1">
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Saving…
        </>
      ) : (
        <>
          <Check aria-hidden />
          Finish setup
        </>
      )}
    </Button>
  );
}

export function OnboardingFlow({
  defaultName,
  today,
}: {
  defaultName: string;
  /** The user's local today, resolved on the server so render stays pure. */
  today: string;
}) {
  const [state, formAction] = useActionState(completeOnboarding, INITIAL);
  const [step, setStep] = useState(0);

  const [displayName, setDisplayName] = useState(defaultName);
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<Sex>('prefer_not_to_say');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(70);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('lightly_active');
  const [weightGoal, setWeightGoal] = useState<WeightGoal>('maintain');
  const [firstWaterMl, setFirstWaterMl] = useState(0);
  const [timezone] = useState(detectTimeZone);

  const ageYears = useMemo(() => {
    if (!isDayKey(birthDate)) return null;
    return ageInYears(birthDate, today);
  }, [birthDate, today]);

  // Mirrors the server calculation exactly — same functions, same package.
  const preview = useMemo(() => {
    if (ageYears === null || ageYears < 13) return null;
    const bmr = basalMetabolicRate({ weightKg, heightCm, ageYears, sex });
    const tdee = totalDailyEnergyExpenditure(bmr, activityLevel);
    return { bmr, tdee, calories: safeCalorieTarget({ tdee, bmr, goal: weightGoal, sex }) };
  }, [ageYears, weightKg, heightCm, sex, activityLevel, weightGoal]);

  const stepOneComplete = displayName.trim().length > 0 && ageYears !== null && ageYears >= 13;
  const imperial = unitSystem === 'imperial';
  const { feet, inches } = cmToFeetInches(heightCm);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* Values live outside the visible step, so a submit carries everything. */}
      <input type="hidden" name="displayName" value={displayName} />
      <input type="hidden" name="birthDate" value={birthDate} />
      <input type="hidden" name="sex" value={sex} />
      <input type="hidden" name="heightCm" value={heightCm} />
      <input type="hidden" name="weightKg" value={weightKg} />
      <input type="hidden" name="timezone" value={timezone} />
      <input type="hidden" name="unitSystem" value={unitSystem} />
      <input type="hidden" name="activityLevel" value={activityLevel} />
      <input type="hidden" name="weightGoal" value={weightGoal} />
      <input type="hidden" name="firstWaterMl" value={firstWaterMl} />

      <ol className="flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                'h-1 rounded-full transition-colors',
                index <= step ? 'bg-primary' : 'bg-border',
              )}
            />
            <span
              className={cn(
                'text-xs',
                index === step ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
              aria-current={index === step ? 'step' : undefined}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name-input">What should we call you?</Label>
            <Input
              id="name-input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Alex"
              autoComplete="given-name"
              aria-invalid={Boolean(state.fieldErrors?.displayName)}
            />
            <FieldError message={state.fieldErrors?.displayName} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dob-input">Date of birth</Label>
            <Input
              id="dob-input"
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.birthDate)}
            />
            <p className="text-xs text-muted-foreground">
              Used only to estimate your energy needs.
            </p>
            <FieldError message={state.fieldErrors?.birthDate} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sex-input">Sex</Label>
            <Select
              id="sex-input"
              value={sex}
              onChange={(event) => setSex(event.target.value as Sex)}
            >
              {SEX_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              The energy equation is only defined for male and female. Other answers use the
              midpoint, which makes the estimate slightly less precise.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="units-input">Units</Label>
            <Select
              id="units-input"
              value={unitSystem}
              onChange={(event) => setUnitSystem(event.target.value as UnitSystem)}
            >
              <option value="metric">Metric (kg, cm, ml)</option>
              <option value="imperial">Imperial (lb, ft/in, fl oz)</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="height-input">Height</Label>
              {imperial ? (
                <div className="flex gap-2">
                  <Input
                    id="height-input"
                    type="number"
                    inputMode="numeric"
                    aria-label="Height in feet"
                    value={feet}
                    min={1}
                    max={8}
                    onChange={(event) =>
                      setHeightCm(round(feetInchesToCm(Number(event.target.value), inches), 1))
                    }
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-label="Height in inches"
                    value={inches}
                    min={0}
                    max={11}
                    onChange={(event) =>
                      setHeightCm(round(feetInchesToCm(feet, Number(event.target.value)), 1))
                    }
                  />
                </div>
              ) : (
                <Input
                  id="height-input"
                  type="number"
                  inputMode="numeric"
                  value={heightCm}
                  min={50}
                  max={280}
                  onChange={(event) => setHeightCm(Number(event.target.value))}
                />
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="weight-input">Weight</Label>
              <Input
                id="weight-input"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={imperial ? round(kgToLb(weightKg), 1) : weightKg}
                onChange={(event) => {
                  const entered = Number(event.target.value);
                  setWeightKg(imperial ? round(lbToKg(entered), 2) : entered);
                }}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Timezone detected as <span className="text-foreground">{timezone}</span>. You can change
            it later in settings.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-input">How active are you day to day?</Label>
            <Select
              id="activity-input"
              value={activityLevel}
              onChange={(event) => setActivityLevel(event.target.value as ActivityLevel)}
            >
              {ACTIVITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {ACTIVITY_LEVEL_LABELS[level]}
                </option>
              ))}
            </Select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm leading-none font-medium">
              What are you aiming for?
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {GOAL_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'cursor-pointer rounded-lg border border-border p-3 text-sm transition-colors',
                    weightGoal === option.value
                      ? 'border-primary bg-accent'
                      : 'hover:border-primary/40',
                  )}
                >
                  <input
                    type="radio"
                    name="weightGoalChoice"
                    value={option.value}
                    checked={weightGoal === option.value}
                    onChange={() => setWeightGoal(option.value)}
                    className="sr-only"
                  />
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {preview && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Estimated daily target
              </p>
              <p data-slot="metric-value" className="mt-1 text-3xl font-semibold">
                {preview.calories.target.toLocaleString()}{' '}
                <span className="text-base font-normal text-muted-foreground">kcal</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Based on an estimated {preview.bmr.toLocaleString()} kcal at rest and{' '}
                {preview.tdee.toLocaleString()} kcal with your activity level. This is an estimate
                from a population equation, not a measurement.
              </p>
              {preview.calories.clamped && preview.calories.note && (
                <p className="mt-2 text-xs leading-relaxed text-warning">{preview.calories.note}</p>
              )}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-medium">Log something now</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              One tap so your dashboard has something in it. Skip it if you&rsquo;d rather not.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {WATER_PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setFirstWaterMl(firstWaterMl === amount ? 0 : amount)}
                aria-pressed={firstWaterMl === amount}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border border-border p-4 transition-colors',
                  firstWaterMl === amount ? 'border-water bg-water/10' : 'hover:border-water/50',
                )}
              >
                <Droplets aria-hidden className="size-5 text-water" />
                <span className="text-sm font-medium">{amount} ml</span>
              </button>
            ))}
          </div>

          {state.status === 'error' && state.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <Button type="button" variant="outline" size="lg" onClick={() => setStep(step - 1)}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            size="lg"
            className="flex-1"
            disabled={step === 0 && !stepOneComplete}
            onClick={() => setStep(step + 1)}
          >
            Continue
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <SubmitButton />
        )}
      </div>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}
