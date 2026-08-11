import { Droplets, Flame, Footprints, Moon, Smile } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ActivityRings } from '@/components/activity-rings';
import { AppHeader } from '@/components/app-header';
import { MedicalDisclaimer } from '@/components/medical-disclaimer';
import { QuickAddBar } from '@/components/quick-add/quick-add-bar';
import { getProfile } from '@/lib/queries/profile';
import { getDosesToday, getRecentActivities, getRecentFoods } from '@/lib/queries/recent';
import { getDailySummary, type DailySummary } from '@/lib/queries/summary';

export const metadata: Metadata = {
  title: 'Today',
  description: 'Your day at a glance.',
};

// Health data is per-user and changes on every log; never cache the page.
export const dynamic = 'force-dynamic';

function greeting(timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(
      new Date(),
    ),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export default async function TodayPage() {
  const profile = await getProfile();

  if (!profile) redirect('/login');
  if (!profile.onboardingCompletedAt) redirect('/onboarding');

  const [summary, recentFoods, recentActivities, doses] = await Promise.all([
    getDailySummary(),
    getRecentFoods(),
    getRecentActivities(),
    getDosesToday(profile.timezone),
  ]);

  const rings = [
    {
      value: summary.move.targetMinutes
        ? summary.move.activeMinutes / summary.move.targetMinutes
        : 0,
      color: 'var(--metric-move)',
      label: 'Move',
    },
    {
      value: summary.energy.targetKcal
        ? summary.energy.consumedKcal / summary.energy.targetKcal
        : 0,
      color: 'var(--metric-energy)',
      label: 'Energy',
    },
    {
      value: summary.water.targetMl ? summary.water.totalMl / summary.water.targetMl : 0,
      color: 'var(--metric-water)',
      label: 'Water',
    },
  ];

  return (
    <>
      <AppHeader />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting(summary.timezone)}
          {profile.displayName ? `, ${profile.displayName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Intl.DateTimeFormat('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: summary.timezone,
          }).format(new Date(`${summary.dayKey}T12:00:00Z`))}
        </p>

        <section
          aria-labelledby="rings-heading"
          className="mt-6 flex items-center gap-6 rounded-xl border border-border bg-card p-5"
        >
          <h2 id="rings-heading" className="sr-only">
            Today&rsquo;s progress
          </h2>
          <ActivityRings rings={rings} size={132} />

          <dl className="flex min-w-0 flex-1 flex-col gap-3">
            <RingLegend
              label="Move"
              color="var(--metric-move)"
              value={`${summary.move.activeMinutes} min`}
              target={`of ${summary.move.targetMinutes} min`}
            />
            <RingLegend
              label="Energy"
              color="var(--metric-energy)"
              value={`${summary.energy.consumedKcal.toLocaleString()} kcal`}
              target={
                summary.energy.targetKcal
                  ? `of ${summary.energy.targetKcal.toLocaleString()} kcal`
                  : 'no target set'
              }
            />
            <RingLegend
              label="Water"
              color="var(--metric-water)"
              value={`${summary.water.totalMl.toLocaleString()} ml`}
              target={`of ${summary.water.targetMl.toLocaleString()} ml`}
            />
          </dl>
        </section>

        {summary.isEmpty ? (
          <EmptyDay />
        ) : (
          <section aria-label="Today's metrics" className="mt-4 grid grid-cols-2 gap-3">
            <MetricTile
              Icon={Footprints}
              color="var(--metric-move)"
              label="Steps"
              value={summary.move.steps.toLocaleString()}
              hint={`Goal ${summary.move.stepsTarget.toLocaleString()}`}
            />
            <MetricTile
              Icon={Flame}
              color="var(--metric-energy)"
              label="Burned"
              value={`${summary.energy.burnedKcal.toLocaleString()} kcal`}
              hint="From logged activity"
            />
            <MetricTile
              Icon={Moon}
              color="var(--metric-sleep)"
              label="Sleep"
              value={summary.sleep ? formatDuration(summary.sleep.minutes) : '—'}
              hint={
                summary.sleep?.quality ? `Quality ${summary.sleep.quality}/5` : 'Not logged yet'
              }
            />
            <MetricTile
              Icon={Smile}
              color="var(--metric-mood)"
              label="Mood"
              value={summary.mood ? `${summary.mood.score}/5` : '—'}
              hint={summary.mood ? 'Logged today' : 'Not logged yet'}
            />
          </section>
        )}

        <MacroBar summary={summary} />

        <MedicalDisclaimer className="mt-8" />
      </main>

      <QuickAddBar
        recentFoods={recentFoods}
        recentActivities={recentActivities}
        doses={doses}
        timezone={summary.timezone}
      />
    </>
  );
}

function RingLegend({
  label,
  color,
  value,
  target,
}: {
  label: string;
  color: string;
  value: string;
  target: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs">
        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-muted-foreground">{label}</span>
      </dt>
      <dd data-slot="metric-value" className="truncate text-lg leading-tight font-semibold">
        {value} <span className="text-xs font-normal text-muted-foreground">{target}</span>
      </dd>
    </div>
  );
}

function MetricTile({
  Icon,
  color,
  label,
  value,
  hint,
}: {
  Icon: typeof Droplets;
  color: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon aria-hidden className="size-4" style={{ color }} />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      <p data-slot="metric-value" className="text-xl font-semibold">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function MacroBar({ summary }: { summary: DailySummary }) {
  const { proteinG, carbsG, fatG } = summary.macros;
  if (proteinG + carbsG + fatG === 0) return null;

  return (
    <section
      aria-label="Macronutrients"
      className="mt-4 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-xs tracking-wide text-muted-foreground uppercase">Macros today</h2>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">Protein</dt>
          <dd data-slot="metric-value" className="text-lg font-semibold">
            {proteinG} g
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Carbs</dt>
          <dd data-slot="metric-value" className="text-lg font-semibold">
            {carbsG} g
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fat</dt>
          <dd data-slot="metric-value" className="text-lg font-semibold">
            {fatG} g
          </dd>
        </div>
      </dl>
    </section>
  );
}

function EmptyDay() {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border/70 p-8 text-center">
      <Droplets aria-hidden className="mx-auto size-6 text-muted-foreground" />
      <h2 className="mt-3 font-medium">Nothing logged yet today</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        A glass of water is the fastest place to start. Whatever you log will show up here
        immediately.
      </p>
    </div>
  );
}
