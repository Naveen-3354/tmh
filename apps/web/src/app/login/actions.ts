'use server';

import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { safeNextPath } from '@/lib/redirects';
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
  const nextPath = safeNextPath(parsed.data.next);

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
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
  const nextPath = safeNextPath(formData.get('next')?.toString());

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error || !data.url) {
    redirect('/login?error=oauth');
  }

  // Google's consent screen is off-site, so it cannot be a typed internal
  // route. This is the documented escape hatch for external redirects.
  redirect(data.url as Route);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
