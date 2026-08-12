/**
 * Fails if a workspace imports a package it does not declare.
 *
 *   node scripts/check-deps.mjs
 *
 * Why this exists: npm workspaces hoist every package into the root
 * node_modules, so an undeclared import resolves perfectly well on a developer
 * machine and then fails on a clean install elsewhere. That is precisely how
 * `@tmh/mcp-core` and `@modelcontextprotocol/sdk` reached production without
 * being dependencies of apps/web — the local build was green and the Vercel
 * build could not resolve either one.
 *
 * Local success is not evidence here, so the check has to be mechanical.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';

const WORKSPACES = [
  'apps/web',
  'apps/mcp-stdio',
  'packages/shared',
  'packages/db',
  'packages/mcp-core',
];

/** Resolved by tooling config rather than by node_modules. */
const NON_PACKAGE_PREFIXES = ['.', '@/', 'node:'];

/** Provided by the framework or the runtime, not installed directly. */
const IMPLICIT = new Set(['react', 'react-dom', 'next']);

const BUILTINS = new Set(builtinModules);

const SOURCE = /\.(ts|tsx|mts|mjs|js)$/;
const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', 'migrations']);

function sourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) out.push(...sourceFiles(full));
    } else if (SOURCE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A syntactically valid npm package name.
 *
 * Needed because the patterns below also match English prose — a comment
 * reading `indistinguishable from "it just does not work"` looks exactly like
 * an import to a regex. Package names can never contain a space, so validating
 * the shape kills that entire class of false positive without having to strip
 * comments (which would in turn mangle any string containing `//`).
 */
const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Bare specifiers from `from '…'`, side-effect `import '…'`, and `require('…')`. */
function importsIn(source) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (NON_PACKAGE_PREFIXES.some((prefix) => specifier.startsWith(prefix))) continue;
      const parts = specifier.split('/');
      const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (BUILTINS.has(name)) continue;
      if (!PACKAGE_NAME.test(name)) continue;
      specifiers.add(name);
    }
  }
  return specifiers;
}

let failures = 0;

for (const workspace of WORKSPACES) {
  const manifestPath = join(workspace, 'package.json');
  if (!existsSync(manifestPath)) continue;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);

  const missing = new Map();
  for (const file of sourceFiles(workspace)) {
    for (const name of importsIn(readFileSync(file, 'utf8'))) {
      if (declared.has(name) || IMPLICIT.has(name)) continue;
      if (!missing.has(name)) missing.set(name, []);
      missing.get(name).push(relative(workspace, file));
    }
  }

  if (missing.size > 0) {
    failures += missing.size;
    console.error(`\n${manifestPath} is missing ${missing.size} dependency declaration(s):`);
    for (const [name, files] of [...missing].sort()) {
      console.error(`  ${name}`);
      for (const file of files.slice(0, 3)) console.error(`      ${file}`);
      if (files.length > 3) console.error(`      …and ${files.length - 3} more`);
    }
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} undeclared dependenc${failures === 1 ? 'y' : 'ies'}. ` +
      'These resolve locally through workspace hoisting and fail on a clean install.\n',
  );
  process.exit(1);
}

console.log('All workspace imports are declared.');
