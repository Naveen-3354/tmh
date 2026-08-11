import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/app-header';
import { MedicalDisclaimer } from '@/components/medical-disclaimer';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { getProfileAndGoals } from '@/lib/queries/profile';
import { listApiTokens } from '@/lib/queries/tokens';
import { siteUrl } from '@/lib/supabase/config';
import { formatHeight, formatVolume } from '@tmh/shared';

import { Connections } from './connections';
import { DangerZone, ImportForm } from './data-tools';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your profile, goals and data.',
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [{ profile, goals }, tokens] = await Promise.all([getProfileAndGoals(), listApiTokens()]);
  if (!profile) redirect('/login');
  if (!profile.onboardingCompletedAt) redirect('/onboarding');

  const units = profile.unitSystem;

  return (
    <>
      <AppHeader />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <section
          aria-labelledby="profile-heading"
          className="mt-6 rounded-xl border border-border bg-card p-5"
        >
          <h2 id="profile-heading" className="font-medium tracking-tight">
            Profile
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label="Name" value={profile.displayName ?? '—'} />
            <Row label="Email" value={profile.email} />
            <Row label="Timezone" value={profile.timezone} />
            <Row label="Units" value={units === 'metric' ? 'Metric' : 'Imperial'} />
            <Row
              label="Height"
              value={profile.heightCm ? formatHeight(profile.heightCm, units) : '—'}
            />
            <Row label="Goal" value={profile.weightGoal} />
          </dl>
        </section>

        <section
          aria-labelledby="targets-heading"
          className="mt-4 rounded-xl border border-border bg-card p-5"
        >
          <h2 id="targets-heading" className="font-medium tracking-tight">
            Daily targets
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row
              label="Calories"
              value={goals?.calorieTarget ? `${goals.calorieTarget.toLocaleString()} kcal` : '—'}
            />
            <Row
              label="Protein"
              value={goals?.proteinTargetG ? `${goals.proteinTargetG} g` : '—'}
            />
            <Row label="Water" value={goals ? formatVolume(goals.waterTargetMl, units) : '—'} />
            <Row
              label="Sleep"
              value={goals ? `${(goals.sleepTargetMinutes / 60).toFixed(1)} h` : '—'}
            />
            <Row label="Steps" value={goals ? goals.stepsTarget.toLocaleString() : '—'} />
            <Row label="Active minutes" value={goals ? `${goals.activeMinutesTarget} min` : '—'} />
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Calorie and macro targets are derived from your profile and capped to a commonly
            recommended range. The app will not set an aggressive deficit.
          </p>
        </section>

        <section
          aria-labelledby="appearance-heading"
          className="mt-4 rounded-xl border border-border bg-card p-5"
        >
          <h2 id="appearance-heading" className="font-medium tracking-tight">
            Appearance
          </h2>
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">Follows your system setting by default.</p>
            <ThemeToggle />
          </div>
        </section>

        <section
          aria-labelledby="export-heading"
          className="mt-4 rounded-xl border border-border bg-card p-5"
        >
          <h2 id="export-heading" className="flex items-center gap-2 font-medium tracking-tight">
            <Download aria-hidden className="size-4 text-primary" />
            Export everything
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Every table, every row, no paywall. These are plain links — they work from a script or
            curl too.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/api/export?format=json"
              download
              className={buttonVariants({ variant: 'outline' })}
            >
              <FileJson aria-hidden />
              Download JSON
            </a>
            <a
              href="/api/export?format=csv"
              download
              className={buttonVariants({ variant: 'outline' })}
            >
              <FileSpreadsheet aria-hidden />
              Download CSV
            </a>
          </div>
        </section>

        <section
          aria-labelledby="import-heading"
          className="mt-4 rounded-xl border border-border bg-card p-5"
        >
          <h2 id="import-heading" className="font-medium tracking-tight">
            Import from CSV
          </h2>
          <p className="mt-1 mb-4 text-sm leading-relaxed text-muted-foreground">
            The universal fallback for moving data in from another tracker.
          </p>
          <ImportForm />
        </section>

        <Connections tokens={tokens} mcpUrl={`${siteUrl()}/api/mcp`} />

        <div className="mt-4">
          <DangerZone />
        </div>

        <MedicalDisclaimer className="mt-8" />
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium capitalize">{value}</dd>
    </div>
  );
}
