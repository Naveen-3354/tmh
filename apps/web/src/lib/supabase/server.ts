import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { supabaseAnonKey, supabaseUrl } from './config';

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * Supabase is used for authentication only — session issuing, refresh and
 * OAuth. All application data goes through Drizzle under RLS
 * (packages/db/src/client.ts), so there is one query layer and one policy set.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore here.
        }
      },
    },
  });
}
