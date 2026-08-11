# tmh — personal health & activity tracker

Track activity, nutrition, sleep, vitals, hydration, mood and medication in one place. Fast to log, exportable in full, no ads and no paywall — plus an **MCP server** so Claude and other AI clients can read and write the same data under the same permissions.

Built as an MVP to demonstrate the feature set and the architecture.

> **Not a medical device.** tmh is a tracking and journaling tool. It does not diagnose or treat anything, and nothing in it is medical advice.

---

## What it does

| | |
|---|---|
| **Log** | Activity (MET-based calorie estimates), nutrition (USDA + Open Food Facts search, barcodes), sleep, water, vitals, mood & symptoms, medication adherence |
| **See** | Daily rings, 7/30/90-day charts, streaks, and rule-based observations about your own data |
| **Own** | Full JSON/CSV export, CSV import, real account deletion |
| **Connect** | MCP server over hosted HTTP and local stdio — 12 tools, 3 resources, 3 prompts |

Three design commitments, each answering a specific complaint about existing trackers ([RESEARCH.md](RESEARCH.md)):

- **Two taps to log.** Every common entry completes from a persistent quick-add bar without a confirm step.
- **Verified nutrition first.** Search ranks staff-verified USDA data above crowdsourced entries and labels the source of every row.
- **No lock-in.** Export is a first-class screen, not a settings footnote.

---

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind v4 · Recharts · Supabase (Postgres + Auth) · Drizzle ORM · Zod · `@modelcontextprotocol/sdk` · Vercel

```
apps/
  web/            Next.js app — UI, server actions, /api/mcp endpoint
  mcp-stdio/      local stdio MCP binary
packages/
  shared/         Zod schemas, calculations, food search  (no I/O except catalogues)
  db/             Drizzle schema, migrations, RLS-scoped client
  mcp-core/       MCP tools/resources/prompts + canonical operations
```

---

## Local setup

Requires **Node 20.11+** and a free Supabase project.

```bash
git clone https://github.com/Naveen-3354/tmh.git
cd tmh
npm install
cp .env.example apps/web/.env.local
```

Fill in `apps/web/.env.local` (Next.js reads env from the app directory, not the repo root):

| Variable | Where to find it | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | yes |
| `DATABASE_URL` | Supabase → Settings → Database → **transaction pooler**, port 6543 | yes |
| `DIRECT_DATABASE_URL` | Same page, **direct** connection, port 5432 — migrations need DDL | yes |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally | yes |
| `USDA_API_KEY` | [free key](https://fdc.nal.usda.gov/api-key-signup.html); falls back to a rate-limited demo key | no |
| `NEXT_PUBLIC_DEMO_ENABLED` / `DEMO_EMAIL` / `DEMO_PASSWORD` | enables the one-click demo button | no |

Then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

`db:seed` creates `demo@tmh.app` / `demo-tmh-2026` with 90 days of deterministic history.

### Commands

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run lint` / `typecheck` / `test` | the CI chain |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run db:migrate` / `db:seed` / `db:studio` | database |
| `npm run build:mcp` | build the stdio MCP binary |

---

## Deploying to Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). Vercel detects Next.js; leave the build settings alone — the monorepo root is correct because the root `package.json` delegates to `apps/web`.
2. **Set the root directory** to `apps/web` if the build cannot find the app.
3. **Add environment variables** (Settings → Environment Variables) — the same list as above, with `NEXT_PUBLIC_SITE_URL` set to your deployed origin, e.g. `https://tmh.vercel.app`. Use the **transaction pooler** connection string; serverless functions exhaust direct connections.
4. **Point Supabase at the deployment**: Authentication → URL Configuration → set Site URL to your Vercel origin, and add `https://<origin>/auth/**` to the redirect allowlist. The wildcard covers both `/auth/callback` and `/auth/confirm`.

   When a redirect URL is not allowlisted, Supabase falls back to the Site URL **silently** — the user lands on `/?code=…` with no session and no error message, which looks exactly like sign-in doing nothing. The app forwards a stray `?code=` to the real handler as a safety net, but the allowlist should still be right.
5. **Deploy**, then run `npm run db:seed` locally once against the same database to populate the demo account.

Everything stays inside free tiers — see [LIMITATIONS.md](LIMITATIONS.md) for the ceilings.

---

## Connecting an AI client

See **[docs/MCP.md](docs/MCP.md)** for copy-pasteable Claude Desktop config (hosted and local), a generic client note, and a curl smoke test.

The short version: create a token in **Settings → Connections**, then point your client at `https://<your-app>/api/mcp` with `Authorization: Bearer tmh_pat_…`.

---

## How the data is protected

This is health data, so authorization is enforced by the database rather than by careful query-writing.

- **Row-level security on all 12 tables.** Every request runs in a transaction that drops to the `authenticated` role and publishes the user's id as `request.jwt.claims`, so `auth.uid()` resolves and Postgres filters. `withUserContext()` is the only exported way to query.
- **Application code never supplies `user_id`.** Inserts pass `sql\`auth.uid()\`` — the database fills in the owner. Writing to someone else's account is not something the code declines to do; it has no way to express it.
- **The MCP server shares that exact path.** A personal access token resolves to a user, and every tool then runs under the same policies as the UI.
- **Proven, not asserted.** `packages/db/src/rls.test.ts` contains no `where user_id = …` clauses anywhere: reads return nothing, inserts claiming another user's id are rejected with SQLSTATE 42501, and updates and deletes affect zero rows. They pass because Postgres refuses.

Safety rules from the brief are database constraints, not UI copy — `goals.calorie_target` is bounded to 1200–8000 kcal, so no path (form, CSV import, or MCP tool) can persist a starvation target.

Food lookups send **a query term or a barcode and nothing else** — no user id, no profile, no history — and are proxied server-side so the catalogues see one origin.

---

## Testing

```bash
npm run test          # 129 unit tests
npm run test:e2e      # Playwright happy path
```

Unit tests cover the calculation layer (energy, macros, streaks, DST-correct day boundaries), the food normalisers, the CSV reader, and the insights engine — including a test that scans every user-visible insight string for prescriptive or diagnostic language.

The RLS suite is an integration test: it skips itself without `DATABASE_URL` and runs against a real Postgres when one is configured.

---

## Documents

| | |
|---|---|
| [RESEARCH.md](RESEARCH.md) | Competitive pass and the design commitments it produced |
| [DECISIONS.md](DECISIONS.md) | Every choice made on the client's behalf, with rationale |
| [LIMITATIONS.md](LIMITATIONS.md) | What's mocked, what won't scale, free-tier ceilings, what to build next |
| [docs/MCP.md](docs/MCP.md) | Connecting an MCP client |
| [docs/DEMO.md](docs/DEMO.md) | Ten-line demo script |
