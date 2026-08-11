import { ArrowRight, Compass, Database, Download, Gauge, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { signInAsDemo } from '@/app/login/actions';
import { ActivityRings } from '@/components/activity-rings';
import { MedicalDisclaimer } from '@/components/medical-disclaimer';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth';

// Reads the session to decide between "get started" and "open your dashboard",
// so a signed-in user is never asked to sign in again.
export const dynamic = 'force-dynamic';

const PRINCIPLES = [
  {
    Icon: Gauge,
    title: 'Two taps to log',
    body: 'Logging friction is the main reason health apps get abandoned. Every common entry — water, mood, a repeated meal, a repeated workout — completes in at most two taps.',
  },
  {
    Icon: ShieldCheck,
    title: 'Verified nutrition first',
    body: 'Food search ranks staff-verified USDA data above crowdsourced entries, and every row shows where its numbers came from.',
  },
  {
    Icon: Download,
    title: 'Your data leaves whenever',
    body: 'Full JSON and CSV export of every table, CSV import, and real account deletion. No paywall, no ads, no analytics SDKs.',
  },
  {
    Icon: Database,
    title: 'Readable by your AI client',
    body: 'A built-in MCP server exposes the same data and the same permissions to Claude and other MCP clients, over a revocable token you control.',
  },
] as const;

const RINGS = [
  { value: 0.82, color: 'var(--metric-move)', label: 'Move' },
  { value: 0.64, color: 'var(--metric-energy)', label: 'Energy' },
  { value: 0.45, color: 'var(--metric-water)', label: 'Water' },
] as const;

export default async function HomePage() {
  const user = await getCurrentUser();
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ENABLED === 'true';

  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <ActivityRings rings={RINGS} size={26} />
          tmh
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={user ? '/today' : '/login'}
            className={buttonVariants({ variant: user ? 'default' : 'outline', size: 'sm' })}
          >
            {user ? 'Open app' : 'Sign in'}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16">
        <section className="grid items-center gap-10 py-10 sm:py-16 md:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
              Personal health tracker
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Everything you track, in one place you actually own.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
              Activity, nutrition, sleep, vitals, hydration, mood and medication — logged fast,
              charted clearly, and exportable in full. Built as a working MVP with an MCP server so
              your AI client can read and write the same data.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={user ? '/today' : '/login'}
                className={buttonVariants({ size: 'lg', className: 'w-full sm:w-auto' })}
              >
                {user ? 'Open your dashboard' : 'Get started — it’s free'}
                <ArrowRight aria-hidden />
              </Link>

              {!user && demoEnabled && (
                <form action={signInAsDemo} className="w-full sm:w-auto">
                  <Button type="submit" variant="outline" size="lg" className="w-full sm:w-auto">
                    <Compass aria-hidden />
                    Explore the demo
                  </Button>
                </form>
              )}
            </div>

            {!user && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                No password to remember — sign in with an email link or Google. The demo is 90 days
                of sample data, no signup needed.
              </p>
            )}
          </div>

          <ActivityRings rings={RINGS} size={196} className="mx-auto md:mx-0" />
        </section>

        <section aria-labelledby="principles" className="border-t border-border/70 pt-10">
          <h2 id="principles" className="text-lg font-medium tracking-tight">
            What we decided differently
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each of these answers a specific, repeated complaint about existing trackers.
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map(({ Icon, title, body }) => (
              <li
                key={title}
                className="rounded-xl border border-border bg-card/60 p-5 transition-colors hover:border-primary/40"
              >
                <Icon aria-hidden className="size-5 text-primary" />
                <h3 className="mt-3 font-medium tracking-tight">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {!user && (
          <section className="mt-10 flex flex-col items-start gap-4 rounded-xl border border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-medium tracking-tight">Start tracking in about a minute</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Three short setup steps, then your first log. Nothing to install.
              </p>
            </div>
            <Link
              href="/login"
              className={buttonVariants({ size: 'lg', className: 'w-full shrink-0 sm:w-auto' })}
            >
              Create your account
              <ArrowRight aria-hidden />
            </Link>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 pb-10">
        <MedicalDisclaimer />
      </footer>
    </>
  );
}
