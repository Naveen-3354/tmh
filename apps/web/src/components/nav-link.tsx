'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export function NavLink({ href, children }: { href: Route; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-2.5 py-1.5 text-sm transition-colors sm:px-3',
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}
