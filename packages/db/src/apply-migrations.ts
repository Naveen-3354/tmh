/**
 * Applies checked-in migrations to the database in DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * Runs with the connection's own privileges (not the `authenticated` role),
 * because the migrations create triggers on `auth.users` and grant table
 * privileges. Use the direct connection string, not the pooler.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function loadLocalEnv(): void {
  if (process.env.DATABASE_URL) return;
  // Shares apps/web/.env.local so there is one file to edit. Parsed directly
  // rather than pulling in a dotenv dependency for a single script.
  const envPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'apps',
    'web',
    '.env.local',
  );
  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of contents.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || process.env[key]) continue;
    process.env[key] = (rawValue ?? '').replace(/^["']|["']$/g, '');
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  // DDL needs a direct connection; the transaction pooler cannot run it.
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error(
      'DATABASE_URL is not set.\n\n' +
        'Supabase dashboard -> Project Settings -> Database -> Connection string -> URI.\n' +
        'Add it to .env.local as DATABASE_URL=postgresql://...\n',
    );
    process.exit(1);
  }

  // A single non-pooled connection: DDL and prepared statements need it.
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 30 });

  try {
    console.log('Applying migrations...');
    await migrate(drizzle(client), { migrationsFolder });
    console.log('Migrations applied.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
