/**
 * Environment access for the Supabase clients.
 *
 * Read lazily through functions rather than at module scope so that importing
 * a module never throws — CI builds and typechecks run without real
 * credentials, and only an actual auth call requires them.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill in your Supabase project values.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Absolute origin, used to build auth redirect URLs. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  // Vercel sets this automatically on preview deployments.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
