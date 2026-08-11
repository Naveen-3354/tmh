/**
 * Proves that row-level security actually isolates users.
 *
 * This is an integration test: it needs a real Postgres with the migrations
 * applied, because the thing under test is a database policy, not application
 * code. It skips itself when DATABASE_URL is absent so CI stays green without
 * credentials.
 *
 *   DATABASE_URL=postgresql://... npx vitest run packages/db/src/rls.test.ts
 *
 * Note what is deliberately *not* done here: no query filters by user_id. If
 * these tests pass, they pass because Postgres refused, not because the query
 * was careful.
 */

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeConnection, withElevatedContext, withUserContext } from './client';
import { profiles, waterLogs } from './schema';

const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_URL);

const userA = randomUUID();
const userB = randomUUID();
const suffix = randomUUID().slice(0, 8);

async function createAuthUser(id: string, email: string): Promise<void> {
  await withElevatedContext(async (db) => {
    await db.execute(sql`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', ${id}::uuid, 'authenticated',
        'authenticated', ${email}, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
    `);
  });
}

async function deleteAuthUser(id: string): Promise<void> {
  await withElevatedContext(async (db) => {
    await db.execute(sql`delete from auth.users where id = ${id}::uuid`);
  });
}

describe.skipIf(!DATABASE_CONFIGURED)('row-level security', () => {
  let userAWaterLogId: string;

  beforeAll(async () => {
    await createAuthUser(userA, `rls-a-${suffix}@example.test`);
    await createAuthUser(userB, `rls-b-${suffix}@example.test`);

    // A logs some water. The trigger on auth.users already made the profile.
    userAWaterLogId = await withUserContext(userA, async (db) => {
      const [row] = await db
        .insert(waterLogs)
        .values({ userId: userA, occurredAt: new Date(), amountMl: 500 })
        .returning({ id: waterLogs.id });
      if (!row) throw new Error('insert returned no row');
      return row.id;
    });
  }, 60_000);

  afterAll(async () => {
    await deleteAuthUser(userA);
    await deleteAuthUser(userB);
    await closeConnection();
  }, 60_000);

  it('lets a user read their own rows', async () => {
    const rows = await withUserContext(userA, (db) => db.select().from(waterLogs));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(userAWaterLogId);
  });

  it('returns no rows to a different user, with no filter in the query', async () => {
    const rows = await withUserContext(userB, (db) => db.select().from(waterLogs));
    expect(rows).toHaveLength(0);
  });

  it('hides another user’s profile', async () => {
    const rowsForA = await withUserContext(userA, (db) => db.select().from(profiles));
    const rowsForB = await withUserContext(userB, (db) => db.select().from(profiles));

    expect(rowsForA).toHaveLength(1);
    expect(rowsForA[0]?.id).toBe(userA);
    expect(rowsForB).toHaveLength(1);
    expect(rowsForB[0]?.id).toBe(userB);
  });

  it('refuses an insert that claims another user’s id', async () => {
    await expect(
      withUserContext(userB, (db) =>
        db
          .insert(waterLogs)
          .values({ userId: userA, occurredAt: new Date(), amountMl: 250 })
          .returning({ id: waterLogs.id }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('silently affects nothing when updating another user’s row', async () => {
    const updated = await withUserContext(userB, (db) =>
      db.update(waterLogs).set({ amountMl: 9999 }).returning({ id: waterLogs.id }),
    );
    expect(updated).toHaveLength(0);

    // A's row is untouched.
    const rows = await withUserContext(userA, (db) => db.select().from(waterLogs));
    expect(rows[0]?.amountMl).toBe(500);
  });

  it('silently affects nothing when deleting another user’s row', async () => {
    const deleted = await withUserContext(userB, (db) =>
      db.delete(waterLogs).returning({ id: waterLogs.id }),
    );
    expect(deleted).toHaveLength(0);

    const rows = await withUserContext(userA, (db) => db.select().from(waterLogs));
    expect(rows).toHaveLength(1);
  });

  it('rejects a non-UUID user id before it reaches the claim', async () => {
    await expect(
      withUserContext("' or true --", (db) => db.select().from(waterLogs)),
    ).rejects.toThrow(/UUID/i);
  });
});

describe.skipIf(DATABASE_CONFIGURED)('row-level security (skipped)', () => {
  it('needs DATABASE_URL to run', () => {
    expect(DATABASE_CONFIGURED).toBe(false);
  });
});
