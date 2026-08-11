import type { Metadata } from 'next';
import Link from 'next/link';

import { ActivityRings } from '@/components/activity-rings';
import { MedicalDisclaimer } from '@/components/medical-disclaimer';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to tmh.',
};

const RINGS = [
  { value: 0.82, color: 'var(--metric-move)', label: 'Move' },
  { value: 0.64, color: 'var(--metric-energy)', label: 'Energy' },
  { value: 0.45, color: 'var(--metric-water)', label: 'Water' },
] as const;

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const nextParam = typeof params.next === 'string' ? params.next : '/today';
  const oauthFailed = params.error === 'oauth';

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12"
    >
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 self-start font-semibold tracking-tight"
      >
        <ActivityRings rings={RINGS} size={26} />
        tmh
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1.5 mb-6 text-sm leading-relaxed text-muted-foreground">
        No password to remember. We&rsquo;ll email you a link that signs you straight in.
      </p>

      {oauthFailed && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Google sign-in didn&rsquo;t complete. Try again, or use an email link instead.
        </p>
      )}

      <LoginForm next={nextParam} />

      <MedicalDisclaimer className="mt-10" />
    </main>
  );
}
