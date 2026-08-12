/**
 * Database access, always scoped to one user by row-level security.
 *
 * There is deliberately no way to run an unscoped query from application code.
 * `withUserContext` opens a transaction, drops to the `authenticated` role and
 * publishes the user's id as the JWT claim that Supabase's `auth.uid()` reads.
 * From that point Postgres itself enforces ownership — the web app and the MCP
 * server are subject to the same policies, and a forgotten `where user_id = ?`
 * returns nothing instead of leaking another user's rows.
 */

import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type UserScopedDatabase = Parameters<Parameters<Database['transaction']>[0]>[0];

let client: postgres.Sql | undefined;

function connection(): postgres.Sql {
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and use the Supabase ' +
        'transaction-pooler connection string (port 6543).',
    );
  }

  client = postgres(url, {
    // Supavisor's transaction pooling mode cannot carry prepared statements.
    prepare: false,
    // Serverless invocations are short-lived; a wide pool just exhausts the
    // free tier's connection budget.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return client;
}

function database(): Database {
  // Every column is named explicitly in schema.ts, so no casing strategy is
  // applied here — runtime and drizzle-kit must agree on identifiers.
  return drizzle(connection(), { schema });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run queries as `userId`, with RLS enforced.
 *
 * @throws if `userId` is not a UUID — a malformed id must never reach the
 *   claim string, and failing closed here is cheaper than a policy misfire.
 */
export async function withUserContext<T>(
  userId: string,
  run: (db: UserScopedDatabase) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('withUserContext requires a UUID user id.');
  }

  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });

  return database().transaction(async (tx) => {
    // Both settings in a single statement, deliberately.
    //
    // `SET LOCAL ROLE authenticated` and `set_config('role', ..., true)` are
    // the same thing — SET ROLE is implemented as the `role` GUC — so this is
    // equivalent to the two-statement version but costs one network round trip
    // instead of two. Against a database in another region that difference is
    // ~50ms on *every* query in the app, which is worth more than the symmetry.
    //
    // Both are transaction-local and unwind on commit or rollback.
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`,
    );
    return run(tx);
  });
}

/**
 * Run queries with the connection's own privileges, bypassing RLS.
 *
 * Only two callers are legitimate: migrations, and resolving an opaque MCP
 * token to its owner (which by definition happens before a user is known).
 * Every other caller must use `withUserContext`.
 */
export async function withElevatedContext<T>(run: (db: Database) => Promise<T>): Promise<T> {
  return run(database());
}

/** Close the pool. Used by scripts and tests; the app leaves it open. */
export async function closeConnection(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
  }
}
