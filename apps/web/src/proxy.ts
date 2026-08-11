import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy-session';

/**
 * Next 16 renamed the `middleware` file convention to `proxy`, and the exported
 * function with it. The runtime is Node and is not configurable.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the service worker and image files.
     * Auth routes are matched deliberately: they need the session cookie
     * written on the way through.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)',
  ],
};
