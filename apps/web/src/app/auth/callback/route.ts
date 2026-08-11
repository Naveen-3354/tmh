import { NextResponse, type NextRequest } from 'next/server';

import { POST_AUTH_NEXT_COOKIE, safeNextPath } from '@/lib/redirects';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Lands the OAuth handshake: exchanges the authorisation code for a session. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  // The destination was stashed before the handshake, because a query string
  // on the redirect URL breaks Supabase's allowlist match. `next` is still
  // read as a fallback for links constructed by hand.
  const next = safeNextPath(
    request.cookies.get(POST_AUTH_NEXT_COOKIE)?.value ?? searchParams.get('next'),
  );

  // Supabase reports provider failures on the redirect itself.
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) {
    console.error('OAuth provider returned an error:', providerError);
    return NextResponse.redirect(new URL('/login?error=oauth', request.url));
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(next, request.url));
      response.cookies.delete(POST_AUTH_NEXT_COOKIE);
      return response;
    }
    console.error('Code exchange failed:', error.message);
  }

  return NextResponse.redirect(new URL('/login?error=oauth', request.url));
}
