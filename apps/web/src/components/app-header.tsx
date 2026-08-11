import { LogOut } from 'lucide-react';

import { ActivityRings } from '@/components/activity-rings';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

import { signOut } from '@/app/login/actions';

const MARK = [
  { value: 0.82, color: 'var(--metric-move)', label: 'Move' },
  { value: 0.64, color: 'var(--metric-energy)', label: 'Energy' },
  { value: 0.45, color: 'var(--metric-water)', label: 'Water' },
] as const;

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <ActivityRings rings={MARK} size={24} />
          tmh
        </span>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
