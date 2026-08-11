/**
 * Local stdio MCP server for tmh.
 *
 * Exposes exactly the same tools, resources and prompts as the hosted
 * endpoint, because both are built by the same factory in @tmh/mcp-core.
 *
 * Configuration, by environment variable:
 *
 *   TMH_TOKEN     required. A personal access token from Settings → Connections.
 *   DATABASE_URL  required. The same Postgres connection string the app uses.
 *   USDA_API_KEY  optional. Raises the food-search rate limit.
 *
 * Nothing is ever written to stdout except protocol frames — stdout is the
 * transport, and a stray console.log corrupts the JSON-RPC stream. Diagnostics
 * go to stderr.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { closeConnection, resolveToken, touchToken } from '@tmh/db';
import { createTmhServer } from '@tmh/mcp-core';

function fatal(message: string): never {
  process.stderr.write(`tmh-mcp: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const token = process.env.TMH_TOKEN?.trim();
  if (!token) {
    fatal(
      'TMH_TOKEN is not set.\n' +
        '  Create a token in the app under Settings → Connections, then set it in your\n' +
        '  MCP client config as the TMH_TOKEN environment variable.',
    );
  }

  if (!process.env.DATABASE_URL) {
    fatal(
      'DATABASE_URL is not set.\n' + '  Use the same Supabase connection string the web app uses.',
    );
  }

  const resolved = await resolveToken(token);
  if (!resolved) {
    fatal('That token is not valid, has been revoked, or has expired.');
  }

  void touchToken(resolved.tokenId);

  const server = createTmhServer({
    userId: resolved.userId,
    usdaApiKey: process.env.USDA_API_KEY,
    source: 'mcp',
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('tmh-mcp: ready\n');

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await closeConnection().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch(async (error: unknown) => {
  process.stderr.write(
    `tmh-mcp: failed to start — ${error instanceof Error ? error.message : String(error)}\n`,
  );
  await closeConnection().catch(() => undefined);
  process.exit(1);
});
