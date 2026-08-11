'use client';

import { createBrowserClient } from '@supabase/ssr';

import { supabaseAnonKey, supabaseUrl } from './config';

let cached: ReturnType<typeof createBrowserClient> | undefined;

/** Browser Supabase client. Memoised so one socket serves the whole tab. */
export function createSupabaseBrowserClient() {
  cached ??= createBrowserClient(supabaseUrl(), supabaseAnonKey());
  return cached;
}
