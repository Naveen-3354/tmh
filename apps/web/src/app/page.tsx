import { Database, Download, Gauge, ShieldCheck } from 'lucide-react';

import { ActivityRings } from '@/components/activity-rings';
import { MedicalDisclaimer } from '@/components/medical-disclaimer';
import { ThemeToggle } from '@/components/theme-toggle';

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

export default function HomePage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <ActivityRings rings={RINGS} size={26} />
          tmh
        </span>
        <ThemeToggle />
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
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 pb-10">
        <MedicalDisclaimer />
      </footer>
    </>
  );
}
