import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveToken, touchToken } from '@tmh/db';
import { createTmhServer } from '@tmh/mcp-core';
import { NextResponse } from 'next/server';

/**
 * Hosted MCP endpoint, Streamable HTTP transport.
 *
 * Runs inside the web app rather than as a separate deployment so it shares
 * one Vercel project, one set of secrets, and — critically — the same RLS
 * path to the database as the UI (DECISIONS.md P0-8).
 *
 * Stateless: each request builds its own server and transport, scoped to the
 * user the bearer token resolves to. That suits serverless, where no instance
 * is guaranteed to see a client's next request, and it means a token can be
 * revoked without a session lingering.
 */

export const dynamic = 'force-dynamic';
// The `postgres` driver needs real sockets.
export const runtime = 'nodejs';

const UNAUTHORIZED_BODY = {
  jsonrpc: '2.0',
  error: {
    code: -32001,
    message:
      'Unauthorized. Send a tmh personal access token as "Authorization: Bearer tmh_pat_...". ' +
      'Create one in the app under Settings → Connections.',
  },
  id: null,
} as const;

function unauthorized(): NextResponse {
  return NextResponse.json(UNAUTHORIZED_BODY, {
    status: 401,
    // Tells a spec-compliant client how to authenticate.
    headers: { 'WWW-Authenticate': 'Bearer realm="tmh"' },
  });
}

function bearerFrom(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const [scheme, ...rest] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}

async function handle(request: Request): Promise<Response> {
  const token = bearerFrom(request);
  if (!token) return unauthorized();

  const resolved = await resolveToken(token);
  // Unknown, revoked and expired are all indistinguishable from here.
  if (!resolved) return unauthorized();

  void touchToken(resolved.tokenId);

  const server = createTmhServer({
    userId: resolved.userId,
    usdaApiKey: process.env.USDA_API_KEY,
    source: 'mcp',
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session to resume, so no session id to issue.
    sessionIdGenerator: undefined,
    // Single JSON responses rather than an SSE stream, which is what
    // serverless functions can actually deliver.
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error('[tmh-mcp] request failed', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error.' },
        id: null,
      },
      { status: 500 },
    );
  } finally {
    // Release the per-request server and transport.
    await server.close().catch(() => undefined);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
