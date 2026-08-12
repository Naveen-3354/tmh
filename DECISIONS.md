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

---

## Phase 2 — Logging surfaces

**P2-1 — One quick-add bar, pinned to the bottom, rather than per-type pages.**
The two-tap rule is only meetable if the entry point is always on screen. Separate log pages would add a navigation step to every entry, which is precisely the friction RESEARCH.md identifies as fatal.

**P2-2 — Native `<dialog>` for the sheets, not a portal library.**
Focus trapping, Escape, inert background and top-layer stacking come from the platform. Less code, and better behaved when a mobile keyboard opens.

**P2-3 — "Recent" lists are ranked by frequency, not recency.**
Most logging is repetition. Ranking by how often something has been logged makes the common case one tap; recency only breaks ties.

**P2-4 — Food catalogue results are always per 100 g, with an optional serving shortcut.**
Silently mixing per-serving and per-100 g values is the single most common source of wildly wrong calorie counts in this category. The basis is explicit in the type and shown in the UI.

**P2-5 — Energy availability outranks provenance in food search.**
Verified data first was the original rule, but a verified row with no calories cannot be logged. Usability of the row comes first; provenance breaks the tie.

**P2-6 — Application code never supplies `user_id`; inserts pass `sql` + `auth.uid()`.**
The database fills in the owner from the session claim. Combined with RLS, writing to another user's account is not something the code declines to do — it has no way to express it.

**P2-7 — Failed writes are returned, not thrown.**
An error boundary would lose the entry the user just typed. Every action returns a discriminated result so the client can roll back its optimistic update and show why.

## Phase 3 — Trends, insights, data ownership

**P3-1 — Missing days are `null`, never `0`, and charts do not connect across them.**
An unlogged day rendered as a drop to zero is a lie about the data — and this app is specifically for people who miss days.

**P3-2 — Insight thresholds are code, not copy.**
Minimum five observations per group, a minimum effect size, and mandatory sample-size disclosure. A test asserts that no insight string contains prescriptive or diagnostic language, so §8 is enforced by CI rather than by reviewer memory.

**P3-3 — Silence is a valid output.**
When nothing clears the threshold the UI says there is not enough data yet. Padding with a vague observation would train users to ignore the section.

**P3-4 — Hand-written RFC 4180 CSV reader instead of a dependency.**
The failure mode of a naive `split(',')` is silent column shifting on any food named "Yoghurt, Greek". The reader is ~80 lines and has 17 tests.

**P3-5 — Import validates per row and skips failures with a line number.**
A 400-row export with two typos should import 398 rows, not zero.

**P3-6 — Deletion cascades from `auth.users` rather than soft-deleting.**
"Delete my account" has to mean it. The FKs in migration 0001 are what make that true.

## Phase 4 — MCP

**P4-1 — One factory builds both transports.**
`createTmhServer` is called by the hosted route and the stdio binary alike, so the two surfaces cannot drift apart.

**P4-2 — Tool inputs are the shared Zod schemas verbatim, refinements included.**
Not copies, not re-derived shapes. A value rejected by the web form is rejected by the tool, including cross-field rules like "only blood pressure takes a second value".

**P4-3 — Timestamps in schemas are ISO strings that transform to Dates, not `z.coerce.date()`.**
Forced by MCP: tool definitions must serialise to JSON Schema, and a Zod date cannot. `tools/list` failed outright until this changed. Documented in `docs/MCP.md` so the next tool does not reintroduce it.

**P4-4 — The remote endpoint is stateless.**
Each request builds its own server and resolves its own token. Suits serverless, where no instance is guaranteed to see the next request, and it makes revocation take effect immediately.

**P4-5 — Tokens are opaque, hashed at rest, and shown once.**
32 random bytes behind a `tmh_pat_` prefix so they are greppable in a leak. Only a SHA-256 hash is stored, so a database dump yields no working credentials.

**P4-6 — Revoked, not deleted.**
The connections list stays an honest record of what existed and when it was last used.

**P4-7 — API routes authenticate themselves and are never redirected by the proxy.**
`/api/mcp` uses a bearer token, so a cookie check would reject every valid client — it was returning 307s to an HTML login page. Beyond that, a machine caller deserves a 401 with a JSON body.

## Phase 5 — Delivery

**P5-1 — Playwright asserts the two-tap claim, not merely that a write succeeds.**
The test opens the sheet, taps one preset, and asserts the dashboard total changed — so a regression that adds a confirm step fails the suite.

**P5-2 — End-to-end tests are not wired into CI.**
They need a live seeded database, and putting a production connection string into CI secrets for an MVP is a worse trade than running them locally. `npm run test:e2e` is documented instead.

**P5-3 — The offline shell cannot queue writes.**
Silently queuing health data risks committing it against the wrong day once connectivity returns. Failing loudly while offline is the safer behaviour; a proper queue needs an explicit pending state, which is listed in LIMITATIONS.md as future work.

**P5-4 — Lighthouse was not run, and the README does not claim a score.**
The Browser pane was unavailable in the build environment. The structural work is done, but an unverified number is worse than an acknowledged gap.

---

## Camera food logging

**C-1 — Barcode first, photo second.**
The camera tries an on-device barcode scan before offering photo recognition. For a packaged product a barcode is not merely more private, it is *more accurate* — it resolves to an exact catalogue entry rather than a guess at what is on the plate.

**C-2 — Barcode decoding never leaves the device, and no image is created.**
Frames are decoded in the browser and discarded; only the resulting number is sent. Native `BarcodeDetector` where it exists, ZXing-wasm (`barcode-detector`) elsewhere — loaded lazily, so browsers with the native API never download it. Without it, iOS Safari would have had no scanner at all, which is exactly where a phone demo happens.

**C-3 — Photo recognition is a documented exception to §8, behind two switches.**
The brief says lookups send query terms only. A photograph is materially more than that, so it never happens unless the deployment sets `GEMINI_API_KEY` **and** the user opts in (`profiles.photo_recognition_enabled`, default false). Consent is asked in context, at the moment of first use, and revocable in Settings. Unset key means the feature is simply absent, not broken.

**C-4 — The image is never stored.**
Held in memory, sent, discarded. No column, no bucket, no log row referencing it. Only the confirmed food names and portions persist.

**C-5 — The model identifies; the catalogues supply the nutrition.**
Gemini is asked what the food is and roughly how much — things it is good at. It is not trusted for calorie or macro figures. Each recognised name is looked up in USDA/Open Food Facts and scaled to the estimated portion, so a logged entry carries verified data wherever a match exists. Model figures are a fallback, and the UI labels them "estimated".

**C-6 — Nothing is logged without confirmation.**
Recognition produces a review list with editable names, editable gram amounts, per-item include toggles and a visible confidence level. A guess must never write itself into a health record.

**C-7 — The image is downscaled to a 900 px long edge before upload.**
Ample for recognition, and it keeps the request well inside serverless body limits while reducing what is transmitted.

**C-8 — `Sheet` distinguishes a programmatic close from a dismissal.**
`dialog.close()` fires the same `close` event as pressing Escape. Treating both as a dismissal broke every sheet-to-sheet handoff: opening the camera from the food sheet closed the first dialog, whose `close` event then cleared the state that had just opened the second. Found by testing the handoff, not by reading the code.
