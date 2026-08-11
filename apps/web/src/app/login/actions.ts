'use server';

import type { Route } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { POST_AUTH_COOKIE_OPTIONS, POST_AUTH_NEXT_COOKIE, safeNextPath } from '@/lib/redirects';
import { siteUrl } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LoginState {
  status: 'idle' | 'sent' | 'error';
  message?: string;
}

const emailSchema = z.object({
  email: z.email('Enter a valid email address.'),
  next: z.string().optional(),
});

/**
 * Stash the post-auth destination in a cookie so the redirect URL handed to
 * Supabase stays constant and allowlistable. See POST_AUTH_NEXT_COOKIE.
 */
async function rememberNext(next: string | undefined): Promise<void> {
  const store = await cookies();
  store.set(POST_AUTH_NEXT_COOKIE, safeNextPath(next), POST_AUTH_COOKIE_OPTIONS);
}

/** Sends a magic link. Never reveals whether the address already has an account. */
export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse({
    email: formData.get('email'),
    next: formData.get('next'),
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Enter a valid email.' };
  }

  const supabase = await createSupabaseServerClient();
  await rememberNext(parsed.data.next);

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    return {
      status: 'error',
      message:
        error.status === 429
          ? 'Too many requests just now. Try again in a minute.'
          : 'Could not send the link. Check the address and try again.',
    };
  }

  return { status: 'sent' };
}

/** Starts the Google OAuth handshake. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await rememberNext(formData.get('next')?.toString());

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect('/login?error=oauth');
  }

  // Google's consent screen is off-site, so it cannot be a typed internal
  // route. This is the documented escape hatch for external redirects.
  redirect(data.url as Route);
}

/**
 * Signs in to the shared demo account.
 *
 * Exists so a stakeholder can look at real-looking data without an inbox or a
 * sign-up. The credentials never reach the browser — only the boolean that
 * decides whether to render the button does. The account is ordinary in every
 * other respect: RLS scopes it to its own rows exactly like any user.
 */
export async function signInAsDemo(): Promise<void> {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;

  if (!email || !password) {
    redirect('/login?error=demo');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('Demo sign-in failed', error.message);
    redirect('/login?error=demo');
  }

  redirect('/today');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
