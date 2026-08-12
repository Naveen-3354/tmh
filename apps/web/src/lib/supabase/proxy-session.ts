import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { supabaseAnonKey, supabaseUrl } from './config';

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ['/', '/login', '/offline', '/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * API routes authenticate themselves and must never be redirected.
 *
 * Two reasons. `/api/mcp` authenticates with a bearer token rather than a
 * session cookie, so a cookie check here would reject every valid client. And
 * for the cookie-based routes, a machine caller deserves a 401 with a JSON
 * body, not a 307 to an HTML login page — which is exactly what an MCP client
 * or a curl script would choke on.
 */
function isSelfAuthenticating(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

/**
 * Refreshes the Supabase session cookie and gates private routes.
 *
 * Called from `proxy.ts` — Next 16 renamed the `middleware` convention to
 * `proxy` and pinned it to the Node runtime (DECISIONS.md P0-6).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  /**
   * Establish identity without a network call.
   *
   * `getUser()` revalidates against the auth server on *every* request, which
   * measured at ~700ms per navigation here — by far the largest cost in the
   * app, paid before a single byte of the page was rendered.
   *
   * `getClaims()` verifies the JWT's signature locally against the project's
   * cached JWKS, so it is just as trustworthy as `getUser()` for an access
   * decision — unlike `getSession()`, which merely decodes a cookie the client
   * could have written. It falls back to an auth-server call by itself if the
   * project still uses a legacy shared secret, so this is safe either way.
   */
  let signedIn = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    signedIn = !error && Boolean(data?.claims?.sub);
  } catch {
    // Verification unavailable; fail closed and let the page's own getUser()
    // make the final call rather than admitting an unverified request.
    signedIn = false;
  }

  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname) && !isSelfAuthenticating(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('next', pathname);
    return NextResponse.redirect(redirect);
  }

  if (signedIn && pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/today';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}
