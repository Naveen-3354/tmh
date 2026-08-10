'use client';

import { useEffect } from 'react';

/**
 * Registers the offline shell service worker.
 *
 * Hand-rolled rather than via `next-pwa`, which injects a webpack config and
 * therefore fails the build under Turbopack-by-default in Next 16
 * (DECISIONS.md P0-7).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration costs offline support, nothing else. The app
        // stays fully usable online, so this is deliberately not surfaced.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
