import { toDayKey } from '@tmh/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ActivityRings } from '@/components/activity-rings';
import { MedicalDisclaimer } from '@/components/medical-disclaimer';
import { requireUser } from '@/lib/auth';
import { getProfile } from '@/lib/queries/profile';

import { OnboardingFlow } from './onboarding-flow';

export const metadata: Metadata = {
  title: 'Set up',
  description: 'Three quick steps to set up tmh.',
};

const RINGS = [
  { value: 0.82, color: 'var(--metric-move)', label: 'Move' },
  { value: 0.64, color: 'var(--metric-energy)', label: 'Energy' },
  { value: 0.45, color: 'var(--metric-water)', label: 'Water' },
] as const;

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await getProfile();

  if (profile?.onboardingCompletedAt) {
    redirect('/today');
  }

  const defaultName = profile?.displayName ?? user.email.split('@')[0] ?? '';

  return (
    <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-10">
      <div className="mb-8 flex items-center gap-2 font-semibold tracking-tight">
        <ActivityRings rings={RINGS} size={26} />
        tmh
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Let&rsquo;s set you up</h1>
      <p className="mt-1.5 mb-8 text-sm leading-relaxed text-muted-foreground">
        Three quick steps. Everything here can be changed later, and none of it leaves your account.
      </p>

      <OnboardingFlow
        defaultName={defaultName}
        today={toDayKey(new Date(), profile?.timezone ?? 'UTC')}
      />

      <MedicalDisclaimer className="mt-10" />
    </main>
  );
}
