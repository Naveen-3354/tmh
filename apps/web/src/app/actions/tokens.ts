'use server';

import { apiTokens, generateToken } from '@tmh/db';
import { eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { queryAsUser } from '@/lib/auth';

/**
 * Personal access tokens for MCP clients.
 *
 * The plaintext is returned exactly once, from the create action, and only
 * its SHA-256 hash is stored. There is deliberately no way to read a token
 * back — if it is lost, revoke it and make another.
 */

export interface TokenState {
  status: 'idle' | 'created' | 'error';
  /** Present only immediately after creation. Never re-readable. */
  token?: string;
  message?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give the token a name.').max(60),
  expiresInDays: z.coerce.number().int().min(0).max(365).default(0),
});

const MAX_ACTIVE_TOKENS = 10;

export async function createApiToken(_prev: TokenState, formData: FormData): Promise<TokenState> {
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    expiresInDays: formData.get('expiresInDays') ?? 0,
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the name.' };
  }

  const { token, tokenHash, prefix } = generateToken();
  const expiresAt =
    parsed.data.expiresInDays > 0
      ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
      : null;

  try {
    await queryAsUser(async (db) => {
      const active = await db
        .select({ id: apiTokens.id })
        .from(apiTokens)
        .where(isNull(apiTokens.revokedAt));

      if (active.length >= MAX_ACTIVE_TOKENS) {
        throw new Error('TOO_MANY');
      }

      await db.insert(apiTokens).values({
        userId: sql`auth.uid()`,
        name: parsed.data.name,
        tokenHash,
        prefix,
        expiresAt,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'TOO_MANY') {
      return {
        status: 'error',
        message: `You already have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`,
      };
    }
    console.error('Token creation failed', error);
    return { status: 'error', message: 'Could not create the token. Please try again.' };
  }

  revalidatePath('/settings');
  return { status: 'created', token };
}

export async function revokeApiToken(formData: FormData): Promise<void> {
  const id = formData.get('id');
  if (typeof id !== 'string') return;

  try {
    await queryAsUser(async (db) => {
      // Revoked rather than deleted, so the connections list keeps an honest
      // record of what existed and when it was last used.
      await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
    });
  } catch (error) {
    console.error('Token revocation failed', error);
  }

  revalidatePath('/settings');
}
