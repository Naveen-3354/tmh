import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * A styled native `<select>`.
 *
 * Native rather than a listbox widget on purpose: it is keyboard- and
 * screen-reader-correct for free, and on mobile it opens the platform picker,
 * which is faster than any custom menu — the whole point of D1 in RESEARCH.md.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'flex h-10 w-full appearance-none rounded-lg border border-input bg-card px-3 py-2 pr-9 text-base transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-destructive',
          'md:text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
