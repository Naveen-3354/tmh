'use client';

import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import { logActivity } from '@/app/actions/logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import type { RecentActivity } from '@/lib/queries/recent';
import { cn } from '@/lib/utils';
import {
  ACTIVITY_INTENSITIES,
  ACTIVITY_TYPES,
  findActivityType,
  type ActivityIntensity,
  type LogOutcome,
} from '@tmh/shared';

const DURATION_PRESETS = [15, 30, 45, 60] as const;

export function ActivitySheet({
  open,
  onClose,
  onLogged,
  recentActivities,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: (outcome: LogOutcome) => void;
  recentActivities: RecentActivity[];
}) {
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState('walking');
  const [intensity, setIntensity] = useState<ActivityIntensity>('moderate');
  const [duration, setDuration] = useState(30);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const submit = (
    input: { activitySlug: string; intensity: ActivityIntensity; durationMinutes: number },
    key: string,
  ) => {
    setBusyKey(key);
    startTransition(async () => {
      const outcome = await logActivity(input);
      setBusyKey(null);
      onLogged(outcome);
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log activity"
      description="Calories burned are estimated from MET values and your latest weight."
    >
      <div className="flex flex-col gap-5">
        {recentActivities.length > 0 && (
          <section aria-labelledby="recent-activities">
            <h3
              id="recent-activities"
              className="mb-2 text-xs tracking-wide text-muted-foreground uppercase"
            >
              Do these again
            </h3>
            <ul className="grid grid-cols-2 gap-1.5">
              {recentActivities.map((activity) => {
                const key = `${activity.activitySlug}:${activity.intensity}`;
                const label =
                  findActivityType(activity.activitySlug)?.label ?? activity.activitySlug;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        submit(
                          {
                            activitySlug: activity.activitySlug,
                            intensity: activity.intensity,
                            durationMinutes: activity.durationMinutes,
                          },
                          key,
                        )
                      }
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-left transition-colors',
                        'hover:border-move hover:bg-move/10 disabled:opacity-60',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {activity.durationMinutes} min · {activity.intensity}
                        </span>
                      </span>
                      {busyKey === key && (
                        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-move" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit({ activitySlug: slug, intensity, durationMinutes: duration }, 'form');
          }}
        >
          <div>
            <Label htmlFor="activity-type">Activity</Label>
            <Select
              id="activity-type"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="mt-1.5"
            >
              {ACTIVITY_TYPES.map((activity) => (
                <option key={activity.slug} value={activity.slug}>
                  {activity.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="activity-intensity">Intensity</Label>
            <Select
              id="activity-intensity"
              value={intensity}
              onChange={(event) => setIntensity(event.target.value as ActivityIntensity)}
              className="mt-1.5"
            >
              {ACTIVITY_INTENSITIES.map((level) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </Select>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm leading-none font-medium">Duration</legend>
            <div className="flex gap-1.5">
              {DURATION_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDuration(minutes)}
                  aria-pressed={duration === minutes}
                  className={cn(
                    'flex-1 rounded-lg border border-border py-2 text-sm transition-colors',
                    duration === minutes
                      ? 'border-move bg-move/15'
                      : 'text-muted-foreground hover:border-move/50',
                  )}
                >
                  {minutes}m
                </button>
              ))}
              <Input
                type="number"
                inputMode="numeric"
                aria-label="Duration in minutes"
                min={1}
                max={1440}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className="w-20"
              />
            </div>
          </fieldset>

          <Button type="submit" size="lg" disabled={pending || duration < 1}>
            {pending && busyKey === 'form' ? (
              <>
                <Loader2 aria-hidden className="animate-spin" />
                Saving…
              </>
            ) : (
              'Log activity'
            )}
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
