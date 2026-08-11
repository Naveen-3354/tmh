import { Flame, Footprints, Lightbulb, Moon, Scale, Smile } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/app-header';
import { MetricChart } from '@/components/charts/metric-chart';
import { MedicalDisclaimer } from '@/components/medical-disclaimer';
import { cn } from '@/lib/utils';
import { getProfile } from '@/lib/queries/profile';
import { getTrends, parseTrendWindow, TREND_WINDOWS } from '@/lib/queries/trends';
import type { Insight } from '@tmh/shared';

export const metadata: Metadata = {
  title: 'Trends',
  description: 'Your patterns over time.',
};

export const dynamic = 'force-dynamic';

const METRIC_COLORS: Record<Insight['metric'], string> = {
  sleep: 'var(--metric-sleep)',
  mood: 'var(--metric-mood)',
  move: 'var(--metric-move)',
  water: 'var(--metric-water)',
  energy: 'var(--metric-energy)',
  vitals: 'var(--metric-vitals)',
};

export default async function TrendsPage({ searchParams }: PageProps<'/trends'>) {
  const profile = await getProfile();
  if (!profile) redirect('/login');
  if (!profile.onboardingCompletedAt) redirect('/onboarding');

  const params = await searchParams;
  const rawRange = typeof params.range === 'string' ? params.range : undefined;
  const windowDays = parseTrendWindow(rawRange);
  const trends = await getTrends(windowDays);

  const series = (pick: (day: (typeof trends.days)[number]) => number | null) =>
    trends.days.map((day) => ({ day: day.day, value: pick(day) }));

  return (
    <>
      <AppHeader />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Trends</h1>

          <nav
            aria-label="Time range"
            className="inline-flex rounded-lg border border-border bg-card p-0.5"
          >
            {TREND_WINDOWS.map((days) => (
              <Link
                key={days}
                href={`/trends?range=${days}`}
                aria-current={days === windowDays ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  days === windowDays
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {days}d
              </Link>
            ))}
          </nav>
        </div>

        <section aria-label="Streaks" className="mt-5 grid grid-cols-2 gap-3">
          <StreakCard
            label="Logging streak"
            current={trends.streaks.logging.current}
            longest={trends.streaks.logging.longest}
          />
          <StreakCard
            label="Activity streak"
            current={trends.streaks.activity.current}
            longest={trends.streaks.activity.longest}
          />
        </section>

        <section aria-labelledby="insights-heading" className="mt-8">
          <h2
            id="insights-heading"
            className="flex items-center gap-2 text-lg font-medium tracking-tight"
          >
            <Lightbulb aria-hidden className="size-4 text-primary" />
            What we noticed
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Patterns in your own logged data over the last {windowDays} days. These are
            observations, not medical findings.
          </p>

          {trends.insights.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border/70 p-6 text-center">
              <p className="text-sm font-medium">Not enough logged yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Patterns appear once there are enough days to compare. We&rsquo;d rather say nothing
                than guess from a handful of entries.
              </p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {trends.insights.map((insight) => (
                <li
                  key={insight.id}
                  className="rounded-xl border border-border bg-card p-4"
                  style={{ borderLeftColor: METRIC_COLORS[insight.metric], borderLeftWidth: 3 }}
                >
                  <h3 className="text-sm font-medium">{insight.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {insight.detail}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Based on {insight.sampleSize} days in the last {insight.windowDays}.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Charts" className="mt-8 flex flex-col gap-6">
          <ChartCard Icon={Footprints} title="Steps" color="var(--metric-move)">
            <MetricChart
              points={series((day) => day.steps)}
              color="var(--metric-move)"
              target={trends.targets.steps}
              variant="bar"
              label="Steps"
            />
          </ChartCard>

          <ChartCard Icon={Moon} title="Sleep" color="var(--metric-sleep)">
            <MetricChart
              points={series((day) => day.sleepMinutes)}
              color="var(--metric-sleep)"
              target={trends.targets.sleepMinutes}
              label="Sleep"
              unit="h"
              format="hoursFromMinutes"
            />
          </ChartCard>

          <ChartCard Icon={Flame} title="Calories eaten" color="var(--metric-energy)">
            <MetricChart
              points={series((day) => day.calories)}
              color="var(--metric-energy)"
              target={trends.targets.calories}
              label="Calories"
              unit="kcal"
            />
          </ChartCard>

          <ChartCard Icon={Smile} title="Mood" color="var(--metric-mood)">
            <MetricChart
              points={series((day) => day.mood)}
              color="var(--metric-mood)"
              label="Mood"
              height={140}
              format="decimal1"
            />
          </ChartCard>

          <ChartCard Icon={Scale} title="Weight" color="var(--metric-vitals)">
            <MetricChart
              points={series((day) => day.weightKg)}
              color="var(--metric-vitals)"
              label="Weight"
              unit="kg"
              format="decimal1"
            />
          </ChartCard>
        </section>

        <MedicalDisclaimer className="mt-8" />
      </main>
    </>
  );
}

function StreakCard({
  label,
  current,
  longest,
}: {
  label: string;
  current: number;
  longest: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p data-slot="metric-value" className="mt-1 text-2xl font-semibold">
        {current} <span className="text-sm font-normal text-muted-foreground">days</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Longest {longest}</p>
    </div>
  );
}

function ChartCard({
  Icon,
  title,
  color,
  children,
}: {
  Icon: typeof Moon;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon aria-hidden className="size-4" style={{ color }} />
        {title}
      </h3>
      {children}
    </section>
  );
}
