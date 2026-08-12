# LIMITATIONS.md

What is real, what is not, what will break at scale, and what I would build next. Written to be useful to whoever picks this up, so it errs toward uncomfortable honesty.

---

## 1. What is genuinely working

Worth stating plainly, because the rest of this document is caveats.

- Auth (magic link + Google), onboarding, and all seven log types write to a real Postgres under row-level security.
- The MCP server runs on both transports and was exercised end to end against the live database — including a two-token isolation check.
- Export, CSV import, and account deletion all do what they say. Deletion cascades from `auth.users`; it is not a flag.
- 129 unit tests, 7 Playwright end-to-end tests, and a 7-case RLS integration suite.

---

## 2. What is mocked, stubbed, or absent

| Area | Status |
|---|---|
| **Google Fit / Health Connect import** | **Not built.** The brief listed it as optional. `step_entries` is shaped for it — a daily total keyed `(user_id, day, source)` so re-imports are idempotent — but nothing fetches from Google. Steps are entered manually. |
| **Barcode scanning** | **Built.** On-device scanning via `BarcodeDetector`, with a ZXing-wasm polyfill for iOS Safari, plus manual entry when the camera is unavailable or blocked. Verified end to end against a real product. |
| **Photo food recognition** | **Built, but off unless configured.** Needs `GEMINI_API_KEY` *and* a per-user opt-in. Two caveats: portion estimates from a photo are rough — treat them as a starting point to edit, not a measurement — and the recognition path has only been tested against the error and gating branches here, because this environment has no camera and no key. Exercise it on a real phone before demoing it. |
| **Medication reminders** | Medications, schedules and adherence tracking exist and work. There are **no notifications** — the PWA service worker has push plumbing but nothing schedules or sends anything. "Reminder" in the brief is delivered as "a list of today's doses you can tick off". |
| **Medication management UI** | Doses can be marked taken/skipped, and medications can be created via the database or MCP, but there is **no add/edit medication screen**. The seeded account has one. |
| **Profile & goal editing** | Settings **displays** profile and targets read-only. Changing them after onboarding requires the database. This is the most visible gap for a real user. |
| **Insights breadth** | Six rules, all hand-written. No statistical significance testing beyond a minimum sample size and a minimum effect size. |
| **Offline logging** | The service worker caches an app shell so the site loads offline. It **cannot queue writes** — logging offline fails. Deliberate: silently queuing health data risks writing it against the wrong day. |

---

## 3. Things that will bite at scale

**Serverless connections.** Every request opens a Postgres connection through Supabase's transaction pooler. It is configured for it (`prepare: false`, small pool), but a real traffic spike will exhaust the free tier's connection budget before it exhausts anything else. Supabase's free tier allows ~200 pooled connections.

**`getTrends` is seven queries per page load.** Fine for one user with 90 days. It is not fine for a dashboard with hundreds of concurrent users — it wants a materialised daily-rollup table, refreshed on write.

**`getRecentFoods` aggregates the entire food history** with `array_agg(... ORDER BY ...)` on every dashboard load. Correct, indexed, and increasingly wasteful past a few thousand rows.

**Food search is uncached across users.** Responses carry `Cache-Control: private`, so two users searching "banana" both hit USDA. A shared cache keyed on the query term would be safe — the query contains nothing personal — and would remove most of the rate-limit exposure.

**The MCP endpoint is stateless per request.** Each call constructs a server, resolves the token, and opens a connection. Correct for serverless and it makes revocation immediate, but it is meaningfully more expensive per call than a session-based server would be.

**No rate limiting anywhere.** A token holder can call the MCP endpoint as fast as they like, and the food-search proxy has no per-user quota. For a single-user MVP that is acceptable; for anything public it is the first thing to add.

---

## 4. Free-tier ceilings you will actually hit

| Service | Ceiling | What happens |
|---|---|---|
| **Supabase** | 500 MB database, **pauses after 7 days of inactivity** | The pause is the one that will surprise you. A demo left alone for a week comes back unreachable until you un-pause it in the dashboard. Before a stakeholder demo, open the app once the day before. |
| **Supabase** | 50,000 monthly active users, 5 GB egress | Not a concern at this scale. |
| **Supabase auth emails** | ~3–4 magic links per hour on the built-in SMTP | Enough for a demo, useless for real users. Wire your own SMTP before anyone else signs up. |
| **Vercel** | 100 GB bandwidth, 10s function timeout (Hobby) | Every page here is dynamic and uncacheable; a heavy `/trends` load on 90 days is well under 10s but is the slowest path. |
| **Vercel** | Hobby is **non-commercial only** | Relevant if this ever ships as a product. |
| **USDA FoodData Central** | `DEMO_KEY` is ~30 requests/hour per IP | Search silently degrades to Open Food Facts only. Set `USDA_API_KEY`. |
| **Open Food Facts** | No hard limit, but the legacy search endpoint returned **503 intermittently** during development | Handled: the client prefers `search.openfoodfacts.org`, falls back, and reports the outage in the UI rather than hiding it. |

---

## 5. Known rough edges

- **The demo account is shared and public.** Its password is in `.env.example` and the sign-in page has a one-click button. Anyone with the URL can read and modify demo data. That is the intent, but it means the demo is not a safe place to put anything real — and the seed must be re-run to reset it.
- **No visual regression or Lighthouse gate in CI.** Lighthouse ≥ 90 was a stated target; I never ran it, because the Browser pane was unavailable in the environment I built this in. The structural work is done (semantic HTML, no layout shift on charts, `font-display: swap`, no blocking third-party scripts) but **the score is unverified**. Run it before quoting a number.
- **Screenshots are missing from the README.** Same cause. Add them from a real browser.
- **Timezone changes do not migrate existing data.** Change your timezone and past days re-bucket, because bucketing happens at read time. Arguably correct, definitely surprising.
- **`e2e` tests write to the demo account.** They add water and mood entries and only the undo test cleans up after itself. Re-seed after a run if the demo needs to look pristine.
- **Two accessibility items are unverified rather than done**: contrast ratios were designed against WCAG AA using oklch lightness, but not measured with a contrast checker; and no screen-reader pass has been done beyond correct semantics and the chart data-table fallbacks.

---

## 6. What I would build next, in order

1. **Profile and goal editing in Settings.** The most obviously missing thing for a real user, and small.
2. **A medication add/edit screen**, closing the gap between "adherence tracking exists" and "you can use it".
3. **Rate limiting on the MCP endpoint and the food proxy.** Cheap, and the first real abuse vector.
4. **A shared food-search cache**, keyed on the query term. Removes most rate-limit exposure at no privacy cost.
5. **A daily rollup table** written on log, replacing the seven-query trends read.
6. **Offline write queue** with an explicit "logged offline, will sync" state and a visible pending count — never silent.
7. **Google Fit import**, using the table shape that is already in place.
8. **A confirmation step for photo portions that learns** — the estimates are rough, and the obvious next move is remembering a user's past corrections for the same food.
9. **Lighthouse and axe in CI**, so the accessibility and performance claims are enforced rather than asserted.

---

## 7. Two things I would push back on if this became a product

**The insights engine is honest but thin.** Six rules over self-reported data with a minimum sample size is the right *shape* — it refuses to speak when it does not know, and it never diagnoses. But users will read correlation as cause no matter how it is worded. If this grows, the phrasing needs review by someone with clinical training, not just careful engineering.

**A shared demo account and a real product should not use the same auth path.** Right now the demo button performs a genuine password sign-in. That is fine for a demo, but it means a public credential exists in a public repo. Before any real launch, either remove the demo account or move it behind a separate, read-only role.
