/**
 * Personal access tokens for the MCP server.
 *
 * The token is opaque and random — never a Supabase key, never a JWT, and
 * never anything a holder could use against Supabase directly. Only a SHA-256
 * hash is stored, so a database leak does not yield working credentials, and
 * the plaintext is shown to the user exactly once.
 *
 * Resolution runs through the `resolve_api_token` SECURITY DEFINER function
 * (migration 0001). That is the single audited place where a query happens
 * before a user is known; everything after it runs under RLS as that user.
 */

import { createHash, randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { withElevatedContext } from './client';

/** Recognisable in a log or a config file, and greppable in a leak. */
export const TOKEN_PREFIX = 'tmh_pat_';

/** Characters shown in the UI so a token can be identified after creation. */
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 6;

export interface GeneratedToken {
  /** Shown once, never stored. */
  token: string;
  tokenHash: string;
  /** Safe to store and display. */
  prefix: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateToken(): GeneratedToken {
  // 32 bytes of CSPRNG output; base64url keeps it copy-pasteable.
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    token,
    tokenHash: hashToken(token),
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

export interface ResolvedToken {
  userId: string;
  tokenId: string;
}

/**
 * Exchange a bearer token for its owner.
 *
 * Returns null for anything unknown, revoked or expired — the caller must not
 * be able to distinguish those cases, so no reason is reported.
 */
export async function resolveToken(token: string): Promise<ResolvedToken | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const rows = await withElevatedContext(async (db) =>
    db.execute<{ user_id: string; token_id: string }>(
      sql`select * from public.resolve_api_token(${hashToken(token)})`,
    ),
  );

  const row = rows[0];
  if (!row) return null;

  return { userId: row.user_id, tokenId: row.token_id };
}

/**
 * Record that a token was used.
 *
 * Deliberately fire-and-forget: a failure to update the timestamp must never
 * fail the request the user actually made.
 */
export async function touchToken(tokenId: string): Promise<void> {
  try {
    await withElevatedContext(async (db) => {
      await db.execute(
        sql`update public.api_tokens set last_used_at = now() where id = ${tokenId}::uuid`,
      );
    });
  } catch {
    // Intentionally ignored.
  }
}
