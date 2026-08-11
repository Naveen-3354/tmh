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
