import { CloudOff } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline',
  description: 'You are offline.',
};

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16"
    >
      <CloudOff aria-hidden className="size-8 text-muted-foreground" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">You&rsquo;re offline</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        tmh needs a connection to load your logs. Anything you already had open stays on screen —
        reconnect and the page will load normally.
      </p>
    </main>
  );
}
