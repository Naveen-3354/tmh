import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { POST_AUTH_NEXT_COOKIE, safeNextPath } from '@/lib/redirects';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Lands the magic link: exchanges the emailed token for a session cookie. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  // Stashed before the email was sent — see POST_AUTH_NEXT_COOKIE.
  const next = safeNextPath(
    request.cookies.get(POST_AUTH_NEXT_COOKIE)?.value ?? searchParams.get('next'),
  );

  // A magic link opened in a different browser has no cookie and no session;
  // Supabase still verifies the token, so this works either way.
  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const response = NextResponse.redirect(new URL(next, request.url));
      response.cookies.delete(POST_AUTH_NEXT_COOKIE);
      return response;
    }
    console.error('Magic link verification failed:', error.message);
  }

  return NextResponse.redirect(new URL('/login?error=link', request.url));
}
