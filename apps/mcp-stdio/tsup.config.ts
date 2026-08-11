import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  bundle: true,
  // Workspace packages ship TypeScript source and have no build output, so
  // they must be bundled in — tsup externalises everything in `dependencies`
  // by default, which would leave the binary unable to resolve them at all.
  noExternal: [/^@tmh\//],
  // Published packages stay external and resolve from node_modules. `postgres`
  // in particular must not be bundled; it breaks its own loader.
  external: ['postgres', '@modelcontextprotocol/sdk'],
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
