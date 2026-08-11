import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-base transition-colors placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive',
        // 16px on mobile stops iOS Safari zooming the viewport on focus.
        'md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
