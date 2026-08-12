import 'server-only';

import { goals, profiles, type Goals, type Profile } from '@tmh/db';

import { onScoped, type UserScopedDatabase } from '../auth';

/**
 * The signed-in user's profile.
 *
 * No `where user_id = ...` clause anywhere in this file: RLS already narrows
 * every table to the caller's rows, so an unfiltered select returns exactly
 * one profile. That is the design — see packages/db/src/client.ts.
 */
export async function getProfile(scoped?: UserScopedDatabase): Promise<Profile | null> {
  return onScoped(scoped, async (db) => {
    const rows = await db.select().from(profiles).limit(1);
    return rows[0] ?? null;
  });
}

export async function getGoals(scoped?: UserScopedDatabase): Promise<Goals | null> {
  return onScoped(scoped, async (db) => {
    const rows = await db.select().from(goals).limit(1);
    return rows[0] ?? null;
  });
}

export async function getProfileAndGoals(scoped?: UserScopedDatabase): Promise<{
  profile: Profile | null;
  goals: Goals | null;
}> {
  return onScoped(scoped, async (db) => {
    const [profileRows, goalRows] = await Promise.all([
      db.select().from(profiles).limit(1),
      db.select().from(goals).limit(1),
    ]);
    return { profile: profileRows[0] ?? null, goals: goalRows[0] ?? null };
  });
}
