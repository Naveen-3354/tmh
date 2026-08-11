# Connecting an MCP client

tmh ships an MCP server so an AI client can read and write the same data as the web app, under the same permissions. There are two ways to run it, and they expose an identical surface — both are built by the same factory in `packages/mcp-core`.

| | Hosted (Streamable HTTP) | Local (stdio) |
|---|---|---|
| Endpoint | `https://<your-app>/api/mcp` | `apps/mcp-stdio/dist/index.js` |
| Auth | `Authorization: Bearer tmh_pat_…` | `TMH_TOKEN` env var |
| Needs `DATABASE_URL` | no (the server has it) | yes |
| Best for | Claude Desktop, hosted clients, anything remote | local development, debugging |

---

## 1. Create a token

In the app: **Settings → Connections → Create token**.

The token is shown **once**. Only a SHA-256 hash is stored, so it cannot be recovered — if you lose it, revoke it and make another. Tokens can be given an expiry and revoked at any time.

A token carries exactly your own permissions. It is not a Supabase key, and it grants nothing at the database beyond the rows row-level security already scopes to you.

---

## 2a. Claude Desktop (hosted)

Claude Desktop speaks stdio, so a small bridge (`mcp-remote`) connects it to the HTTP endpoint. Add this to `claude_desktop_config.json`:

**macOS** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tmh": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://your-app.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer tmh_pat_YOUR_TOKEN_HERE"
      ]
    }
  }
}
```

Restart Claude Desktop. The tools appear under the connect menu.

## 2b. Claude Desktop (local stdio)

Build the binary first:

```bash
npm run build:mcp
```

```json
{
  "mcpServers": {
    "tmh": {
      "command": "node",
      "args": ["/absolute/path/to/tmh/apps/mcp-stdio/dist/index.js"],
      "env": {
        "TMH_TOKEN": "tmh_pat_YOUR_TOKEN_HERE",
        "DATABASE_URL": "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
      }
    }
  }
}
```

The stdio server writes only protocol frames to stdout; diagnostics go to stderr, so `tmh-mcp: ready` in the logs means it started cleanly.

## 2c. Any other MCP client

Point it at `https://your-app.vercel.app/api/mcp`, transport **Streamable HTTP**, with an `Authorization: Bearer` header. The endpoint is stateless — it issues no session id, so nothing needs to be resumed between requests.

---

## 3. Smoke test with curl

Replace the token and host. Both headers matter: the spec requires `Accept` to list both types.

```bash
TOKEN=tmh_pat_YOUR_TOKEN_HERE
MCP=https://your-app.vercel.app/api/mcp

curl -s -X POST "$MCP" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Expect `"serverInfo":{"name":"tmh","version":"0.1.0"}`.

List the tools:

```bash
curl -s -X POST "$MCP" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Read today's summary:

```bash
curl -s -X POST "$MCP" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_daily_summary","arguments":{}}}'
```

Write something (returns the created record's id):

```bash
curl -s -X POST "$MCP" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"log_water","arguments":{"amountMl":250}}}'
```

Verify auth is actually enforced — this must return **401**, not data:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$MCP" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## What the server exposes

### Tools

**Writes** — each returns `{ ok, id, kind, message }` with the created record's id.

| Tool | Notes |
|---|---|
| `log_water` | millilitres |
| `log_activity` | calories burned are estimated server-side from MET values and your latest weight — do not pass them |
| `log_meal` | call `search_food` first rather than estimating nutrition |
| `log_sleep` | attributed to the day you woke up |
| `log_vital` | weight kg, resting HR bpm, blood pressure mmHg (both values), glucose mmol/L |
| `log_mood` | 1–5, with optional note and symptom tags |
| `log_medication_taken` | call `list_medications` first for the id; re-answering the same dose updates it |

**Reads**

| Tool | Notes |
|---|---|
| `get_profile` | profile, timezone, units and daily targets |
| `get_daily_summary` | one local day; defaults to today in your timezone |
| `get_trends` | `metric` × `range` (7/30/90). Days with no data are **absent**, not zero |
| `list_medications` | ids and schedules |
| `search_food` | USDA + Open Food Facts; only the query term leaves the app |

### Resources

| URI | Contents |
|---|---|
| `health://profile` | profile and targets |
| `health://summary/{date}` | one day; `{date}` is `YYYY-MM-DD` or `today` |
| `health://logs/{type}` | raw rows. `?from=YYYY-MM-DD&to=YYYY-MM-DD`, default last 30 days. Types: `activity`, `food`, `sleep`, `water`, `vitals`, `mood`, `steps` |

### Prompts

| Prompt | Purpose |
|---|---|
| `weekly_review` | walk the last seven days and summarise what actually happened |
| `nutrition_gap_check` | compare recent intake against your targets (`days` argument, default 14) |
| `sleep_activity_correlation` | compare days after short sleep with days after long sleep |

---

## How it is secured

- **Row-level security, not application filtering.** Every tool runs inside a transaction that drops to the `authenticated` role and publishes the token owner's id as `request.jwt.claims`. Postgres enforces ownership; a missing `where user_id = …` returns nothing rather than another user's rows. This is verified by an integration test (`packages/db/src/rls.test.ts`) and by an isolation check across two tokens.
- **The token is opaque.** Random, hashed at rest, prefixed `tmh_pat_` so it is greppable in a leak, and revocable. No Supabase key is ever handed out.
- **Errors do not leak.** Validation failures return the user-facing message; anything else is logged server-side and reported as a generic error. No stack traces, no connection strings.
- **Same validation as the UI.** Tool inputs are the Zod schemas from `@tmh/shared` — the same objects the web forms parse against — so a value rejected in one surface is rejected in the other.

### One constraint worth knowing

MCP tool definitions must be expressible as JSON Schema. A Zod date is not, so timestamp fields are ISO 8601 **strings** that parse to dates internally. Passing `z.coerce.date()` made `tools/list` fail outright with `Date cannot be represented in JSON Schema` — if you add a tool, keep its inputs JSON-Schema-representable.
