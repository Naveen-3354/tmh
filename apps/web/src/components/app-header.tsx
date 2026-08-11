import { LogOut } from 'lucide-react';
import Link from 'next/link';

import { signOut } from '@/app/login/actions';
import { ActivityRings } from '@/components/activity-rings';
import { NavLink } from '@/components/nav-link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

const MARK = [
  { value: 0.82, color: 'var(--metric-move)', label: 'Move' },
  { value: 0.64, color: 'var(--metric-energy)', label: 'Energy' },
  { value: 0.45, color: 'var(--metric-water)', label: 'Water' },
] as const;

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 py-3">
        <Link
          href="/today"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <ActivityRings rings={MARK} size={24} />
          <span className="sr-only sm:not-sr-only">tmh</span>
        </Link>

        <nav aria-label="Main" className="flex min-w-0 items-center gap-1">
          <NavLink href="/today">Today</NavLink>
          <NavLink href="/trends">Trends</NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle className="hidden sm:inline-flex" />
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
