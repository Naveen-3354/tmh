'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import { cn } from '@/lib/utils';

/** The mount state never changes after hydration, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  // The server cannot know the stored theme, so selection state is only
  // rendered after hydration. useSyncExternalStore gives a different snapshot
  // on server and client without setting state inside an effect.
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'inline-flex gap-0.5 rounded-full border border-border bg-card/60 p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'grid size-7 place-items-center rounded-full transition-colors',
              'text-muted-foreground hover:text-foreground',
              selected && 'bg-primary text-primary-foreground hover:text-primary-foreground',
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
