import 'server-only';

import { apiTokens } from '@tmh/db';
import { desc } from 'drizzle-orm';

import { queryAsUser } from '../auth';

export interface TokenListItem {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Tokens for the connections screen. The hash is never selected. */
export async function listApiTokens(): Promise<TokenListItem[]> {
  return queryAsUser(async (db) =>
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        lastUsedAt: apiTokens.lastUsedAt,
        expiresAt: apiTokens.expiresAt,
        revokedAt: apiTokens.revokedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt)),
  );
}
