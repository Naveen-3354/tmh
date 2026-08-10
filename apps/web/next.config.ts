import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build output
  // (DECISIONS.md P0-2), so Next compiles them as part of the app.
  transpilePackages: ['@tmh/shared', '@tmh/db', '@tmh/mcp-core'],

  // `postgres` opens raw TCP sockets and must not be bundled for the server.
  serverExternalPackages: ['postgres'],

  typedRoutes: true,

  async headers() {
    return [
      {
        // The service worker must be allowed to control the whole origin.
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Health data: keep it out of third-party hands by default.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
