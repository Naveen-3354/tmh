'use client';

import { Check, Footprints, HeartPulse, Loader2, Moon, Pill, X } from 'lucide-react';
import { useState, useTransition } from 'react';

import { logMedication, logSleep, logSteps, logVital } from '@/app/actions/logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import type { DoseToday } from '@/lib/queries/recent';
import { cn } from '@/lib/utils';
import { VITAL_RANGES, VITAL_TYPES, type LogOutcome, type VitalType } from '@tmh/shared';

type Tab = 'sleep' | 'vitals' | 'steps' | 'meds';

const TABS: { id: Tab; label: string; Icon: typeof Moon }[] = [
  { id: 'sleep', label: 'Sleep', Icon: Moon },
  { id: 'vitals', label: 'Vitals', Icon: HeartPulse },
  { id: 'steps', label: 'Steps', Icon: Footprints },
  { id: 'meds', label: 'Meds', Icon: Pill },
];

export function MoreSheet({
  open,
  onClose,
  onLogged,
  doses,
  timezone,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: (outcome: LogOutcome) => void;
  doses: DoseToday[];
  timezone: string;
}) {
  const [tab, setTab] = useState<Tab>('sleep');

  return (
    <Sheet open={open} onClose={onClose} title="Log something else">
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="Log type" className="flex gap-1 border-b border-border">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-sm transition-colors',
                tab === id
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'sleep' && <SleepForm onLogged={onLogged} timezone={timezone} />}
        {tab === 'vitals' && <VitalsForm onLogged={onLogged} />}
        {tab === 'steps' && <StepsForm onLogged={onLogged} />}
        {tab === 'meds' && <MedsList doses={doses} onLogged={onLogged} timezone={timezone} />}
      </div>
    </Sheet>
  );
}

/** Local "HH:MM" for a given zone, used to prefill the time inputs. */
function localTime(timezone: string, hoursAgo = 0): string {
  const when = new Date(Date.now() - hoursAgo * 3_600_000);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(when);
}

function SleepForm({
  onLogged,
  timezone,
}: {
  onLogged: (outcome: LogOutcome) => void;
  timezone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [bedtime, setBedtime] = useState(() => localTime(timezone, 9));
  const [wakeTime, setWakeTime] = useState(() => localTime(timezone, 1));
  const [quality, setQuality] = useState(3);

  const submit = () => {
    // Build the two instants from today's date in the browser's own clock,
    // rolling bedtime back a day when it reads later than the wake time.
    const now = new Date();
    const [bedHour, bedMinute] = bedtime.split(':').map(Number);
    const [wakeHour, wakeMinute] = wakeTime.split(':').map(Number);
    if (
      bedHour === undefined ||
      bedMinute === undefined ||
      wakeHour === undefined ||
      wakeMinute === undefined
    ) {
      return;
    }

    const wake = new Date(now);
    wake.setHours(wakeHour, wakeMinute, 0, 0);
    const bed = new Date(wake);
    bed.setHours(bedHour, bedMinute, 0, 0);
    if (bed.getTime() >= wake.getTime()) bed.setDate(bed.getDate() - 1);

    startTransition(async () => {
      onLogged(
        await logSleep({
          bedtime: bed.toISOString(),
          wakeTime: wake.toISOString(),
          quality,
        }),
      );
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bedtime">Fell asleep</Label>
          <Input
            id="bedtime"
            type="time"
            value={bedtime}
            onChange={(event) => setBedtime(event.target.value)}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="waketime">Woke up</Label>
          <Input
            id="waketime"
            type="time"
            value={wakeTime}
            onChange={(event) => setWakeTime(event.target.value)}
            className="mt-1.5"
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm leading-none font-medium">How was it?</legend>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setQuality(value)}
              aria-pressed={quality === value}
              aria-label={`Quality ${value} of 5`}
              className={cn(
                'flex-1 rounded-lg border border-border py-2 text-sm transition-colors',
                quality === value
                  ? 'border-sleep bg-sleep/15'
                  : 'text-muted-foreground hover:border-sleep/50',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        Log sleep
      </Button>
    </form>
  );
}

function VitalsForm({ onLogged }: { onLogged: (outcome: LogOutcome) => void }) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<VitalType>('weight');
  const [value, setValue] = useState('');
  const [secondary, setSecondary] = useState('');

  const range = VITAL_RANGES[type];
  const isBloodPressure = type === 'blood_pressure';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const outcome = await logVital({
            type,
            value: Number(value),
            ...(isBloodPressure ? { secondaryValue: Number(secondary) } : {}),
          });
          if (outcome.ok) {
            setValue('');
            setSecondary('');
          }
          onLogged(outcome);
        });
      }}
    >
      <div>
        <Label htmlFor="vital-type">Measurement</Label>
        <Select
          id="vital-type"
          value={type}
          onChange={(event) => setType(event.target.value as VitalType)}
          className="mt-1.5"
        >
          {VITAL_TYPES.map((vital) => (
            <option key={vital} value={vital}>
              {VITAL_RANGES[vital].label}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="vital-value">{isBloodPressure ? 'Systolic' : range.label}</Label>
          <Input
            id="vital-value"
            type="number"
            inputMode="decimal"
            step="any"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={range.unit}
            className="mt-1.5"
          />
        </div>
        {isBloodPressure && (
          <div>
            <Label htmlFor="vital-secondary">Diastolic</Label>
            <Input
              id="vital-secondary"
              type="number"
              inputMode="decimal"
              step="any"
              required
              value={secondary}
              onChange={(event) => setSecondary(event.target.value)}
              placeholder={range.unit}
              className="mt-1.5"
            />
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Recorded in {range.unit}. Typical range {range.min}–{range.max}.
      </p>

      <Button type="submit" size="lg" disabled={pending || !value}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        Log reading
      </Button>
    </form>
  );
}

function StepsForm({ onLogged }: { onLogged: (outcome: LogOutcome) => void }) {
  const [pending, startTransition] = useTransition();
  const [steps, setSteps] = useState('');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const outcome = await logSteps({ steps: Number(steps) });
          if (outcome.ok) setSteps('');
          onLogged(outcome);
        });
      }}
    >
      <div>
        <Label htmlFor="steps-input">Steps today</Label>
        <Input
          id="steps-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={200000}
          required
          value={steps}
          onChange={(event) => setSteps(event.target.value)}
          placeholder="8000"
          className="mt-1.5"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Replaces today&rsquo;s manual total rather than adding to it.
        </p>
      </div>

      <Button type="submit" size="lg" disabled={pending || !steps}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        Save steps
      </Button>
    </form>
  );
}

function MedsList({
  doses,
  onLogged,
  timezone,
}: {
  doses: DoseToday[];
  onLogged: (outcome: LogOutcome) => void;
  timezone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  if (doses.length === 0) {
    return (
      <div className="py-6 text-center">
        <Pill aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">No medications scheduled</p>
        <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Add one in Settings and its doses will appear here each day.
        </p>
      </div>
    );
  }

  const record = (dose: DoseToday, status: 'taken' | 'skipped') => {
    const key = `${dose.medicationId}:${dose.scheduledFor.toISOString()}:${status}`;
    setBusy(key);
    startTransition(async () => {
      const outcome = await logMedication({
        medicationId: dose.medicationId,
        scheduledFor: dose.scheduledFor.toISOString(),
        status,
      });
      setBusy(null);
      onLogged(outcome);
    });
  };

  return (
    <ul className="flex flex-col gap-2">
      {doses.map((dose) => {
        const time = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
        }).format(dose.scheduledFor);

        return (
          <li
            key={`${dose.medicationId}:${dose.scheduledFor.toISOString()}`}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{dose.name}</span>
              <span className="block text-xs text-muted-foreground">
                {time}
                {dose.dosage ? ` · ${dose.dosage}` : ''}
                {dose.status ? ` · ${dose.status}` : ''}
              </span>
            </span>

            <Button
              type="button"
              size="sm"
              variant={dose.status === 'taken' ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => record(dose, 'taken')}
              aria-label={`Mark ${dose.name} at ${time} as taken`}
            >
              {busy?.endsWith(':taken') && busy.startsWith(dose.medicationId) ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Check aria-hidden />
              )}
              Taken
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => record(dose, 'skipped')}
              aria-label={`Mark ${dose.name} at ${time} as skipped`}
            >
              <X aria-hidden />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
