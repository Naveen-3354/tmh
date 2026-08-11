import { withUserContext, type UserScopedDatabase } from '@tmh/db';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { createSupabaseServerClient } from './supabase/server';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * The signed-in user, or null.
 *
 * Uses `getUser()`, which revalidates the token against the auth server.
 * `getSession()` only decodes a cookie the client could have forged, so it is
 * never used for an access decision. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
});

/** The signed-in user, or a redirect to the login page. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * The single data-access entry point for the web app.
 *
 * Resolves the caller, then runs the query under their RLS context. There is
 * no exported path that queries without a user, so "forgot to filter by
 * user_id" cannot leak data — Postgres would return no rows.
 */
export async function queryAsUser<T>(run: (db: UserScopedDatabase) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUserContext(user.id, run);
}
