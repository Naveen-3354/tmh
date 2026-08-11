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

---

## Phase 1 — Data model, RLS, auth

**P1-1 — Supabase is used for authentication only; all data access is Drizzle over Postgres.**
The obvious alternative was to query through Supabase's PostgREST client. Rejected because the MCP server authenticates with an opaque token, not a Supabase session — it would have needed either a service-role key (bypassing RLS entirely and reducing "same authorization rules" to a promise about query discipline) or a minted JWT (requiring a shared JWT secret that newer Supabase projects may not expose). One Drizzle layer under RLS avoids both.

**P1-2 — RLS is enforced by dropping to the `authenticated` role inside a transaction.**
`withUserContext()` runs `set_config('request.jwt.claims', …)` then `set local role authenticated`. Both are transaction-local and unwind automatically. This makes `auth.uid()` resolve exactly as it does for PostgREST, so the policies are literally the same SQL for the web app and the MCP server. It is the only exported query path; `withElevatedContext` is the single audited exception, used for migrations and token resolution.

**P1-3 — RLS policies are hand-written SQL, not generated from Drizzle's policy DSL.**
These policies are the entire boundary between one person's health data and another's. They are worth reading directly in a migration file rather than inferring from a schema decorator.

**P1-4 — One `FOR ALL` policy per table instead of four per-operation policies.**
`USING` covers SELECT/UPDATE/DELETE and `WITH CHECK` covers INSERT/UPDATE, so every operation is guarded by construction. Four separate policies per table is 48 objects to keep in sync and a much larger surface for a gap.

**P1-5 — Foreign keys to `auth.users` are declared in the RLS migration, not the Drizzle schema.**
drizzle-kit would otherwise try to diff and manage Supabase's own `auth` schema. The cascade matters: it is what makes account deletion actually delete the data rather than orphan it.

**P1-6 — Safety rules are enforced as database CHECK constraints, not just UI validation.**
`goals.calorie_target` is bounded to 1200–8000, sleep and water targets to sane ranges. A CSV import, an MCP tool call, or a future bug cannot persist a starvation target — the database refuses. Brief §8 is a storage-layer invariant here, not a copy decision.

**P1-7 — Steps live in their own daily-total table, not on activity logs.**
Google Fit and Health Connect export daily totals, and a unique key on `(user_id, day, source)` makes re-importing idempotent rather than duplicating.

**P1-8 — shadcn/ui component API without running its generator.**
`shadcn init` rewrites `globals.css`, which would overwrite the deliberate token layer (metric hues, tabular numerals, focus rings). Primitives are hand-written with the same names, CVA variants and `data-slot` conventions, so shadcn components can still be dropped in later.

**P1-9 — Native `<select>` rather than a custom listbox.**
Correct keyboard and screen-reader behaviour for free, and on mobile it opens the platform picker — which is faster than any custom menu, and speed of logging is the product's first principle.

**P1-10 — `apps/web/.env.local` is the single local env file.**
Next.js does not read `.env` files from a monorepo root, which silently produced a 500 the first time. Rather than adding a loader shim, the file lives where Next expects it and `packages/db`'s migration script reads the same path.

**P1-11 — Age is calendar arithmetic against a server-supplied "today".**
Dividing elapsed milliseconds by 365.2425 drifts around leap days, and calling `Date.now()` during a React render is impure (the React Compiler lint rule caught it). `ageInYears(birthDate, today)` is pure, testable, and resolves the birthday on the correct date in the user's own timezone.
