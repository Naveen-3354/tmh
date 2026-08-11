/**
 * Post-authentication destinations.
 *
 * Anything derived from a query string is attacker-controlled, so only
 * same-site absolute paths are allowed through. Without this, the `next`
 * parameter turns the login flow into an open redirect.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/today'): string {
  if (!value) return fallback;
  // Reject absolute URLs, protocol-relative URLs and backslash tricks.
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}

/**
 * Where to send the user after authentication, carried in a cookie.
 *
 * Not a query parameter on the auth redirect URL. Supabase glob-matches the
 * *entire* `redirect_to` against its allowlist, so appending `?next=/today`
 * stops `https://host/auth/callback` from matching — and Supabase then falls
 * back to the Site URL **silently**, dropping the user on `/?code=…` with no
 * session and no error. Keeping the redirect URL constant makes the allowlist
 * entry exact and removes that whole class of misconfiguration.
 */
export const POST_AUTH_NEXT_COOKIE = 'tmh-post-auth-next';

export const POST_AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // Long enough to click an emailed link, short enough not to linger.
  maxAge: 60 * 15,
  secure: process.env.NODE_ENV === 'production',
};
