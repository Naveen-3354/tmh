# DECISIONS.md

Every choice made on the brief's behalf, with a one-line rationale. Newest phase last.

Format: **ID — Decision.** Rationale.

---

## Answered by the client up front

- **Accounts** — client owns Supabase / Vercel / GitHub; agent never creates accounts or handles passwords. Env values are filled in by the client locally, never pasted into chat or committed.
- **Visual direction** — dark & data-dense (Bevel/Gyroscope-leaning), light mode fully supported.
- **Protected scope if time is cut** — (1) frictionless logging, (2) MCP server, (3) dashboard + trends. Breadth of log types is the designated trim candidate.

---

## Phase 0 — Foundations

**P0-1 — Monorepo uses npm workspaces, not pnpm/Turborepo.**
npm 11 ships with the toolchain already present; pnpm was not installed. Turborepo adds caching value only at a scale this MVP does not reach. One fewer thing to install and configure.

**P0-2 — Workspace packages export TypeScript source, not compiled `dist`.**
`packages/*` set `"main": "./src/index.ts"`. Next.js consumes them via `transpilePackages`, Vitest reads them directly, and only the stdio MCP binary needs a real build (via tsup). This removes an entire build-orchestration layer and keeps type navigation exact.

**P0-3 — Package split: `shared`, `db`, `mcp-core`, plus `apps/web` and `apps/mcp-stdio`.**
`shared` holds Zod schemas and pure calculation logic with zero I/O so it is trivially unit-testable. `mcp-core` holds transport-agnostic tool definitions so the stdio binary and the hosted HTTP route are genuinely the same code, satisfying the brief's "one source of truth" requirement.

**P0-4 — Zod v4 (`^4.4.3`), not v3.**
Verified that every consumer in the stack accepts it: `@modelcontextprotocol/sdk@1.30` declares `zod: ^3.25 || ^4.0`, `drizzle-zod@0.8` declares `^3.25 || ^4.0`. v4 is materially faster and has better JSON-Schema emission, which the MCP tool layer depends on.

**P0-5 — Next.js 16.3 with Turbopack, React 19.2, Tailwind v4.**
Whatever `create-next-app@latest` produces is what Vercel's free tier is tuned for. Turbopack is the default in 16 and needs no flag.

**P0-6 — Read the Next.js docs bundled in `node_modules/next/dist/docs/` before writing app code.**
Next 16 ships an `AGENTS.md` warning that its conventions differ from model training data. Three deltas confirmed and adopted rather than assumed: `middleware.ts` → **`proxy.ts`** with an exported `proxy` function on the Node runtime; `next lint` removed in favour of the ESLint CLI; `cacheComponents`/PPR is opt-in and left **off**.

**P0-7 — PWA is hand-rolled: `app/manifest.ts` + a plain `public/sw.js`, no `next-pwa`.**
The brief said "`next-pwa` or equivalent". `next-pwa` is unmaintained and injects a **webpack** config, which now *fails the build* under Turbopack-by-default in Next 16. The bundled Next PWA guide itself prescribes a plain service worker file. Zero build-tool coupling, nothing to rot.

**P0-8 — The remote MCP transport is a route handler inside the Next.js app (`/api/mcp`), not a separate deployment.**
Keeps the whole system on **one** Vercel free-tier project, shares the DB layer, Zod schemas and auth logic directly, and avoids a second set of environment secrets. `apps/mcp-stdio` remains a standalone bundled binary for local use.

**P0-9 — Default units: metric, with a per-profile imperial toggle; all storage is metric.**
Storing one canonical unit system and converting only at the display edge avoids an entire class of unit-mixing bugs. Metric is the default for the majority of the world; imperial is one profile field away.

**P0-10 — All timestamps stored as `timestamptz` in UTC; the user's IANA timezone lives on the profile.**
"Which day does this log belong to?" is resolved in the user's zone at query time, so DST transitions and travel do not silently move entries between days.

**P0-11 — Schema is multi-user from day one.**
Not re-asked: the brief's own §8 mandates row-level security scoping every row to its owner, which only means anything against a `user_id`-keyed schema. Single-user is then just a population of one.

**P0-12 — Dev-only `npm audit` findings are accepted, not force-fixed.**
`npm audit --omit=dev` reports **0 vulnerabilities**. The 8 findings all sit in `drizzle-kit`'s bundled `@esbuild-kit/*` (deprecated, merged into tsx) and never reach the deployed runtime. `audit fix --force` would downgrade `drizzle-kit` and break migration generation for no security gain.

**P0-13 — Node engine floor is 20.11.**
Next 16 requires ≥20.9; 20.11 is the LTS line that also satisfies Vercel's build image and the `tsx`/`tsup` toolchain.
