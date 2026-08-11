# Demo script

Ten lines, roughly four minutes. Read them out while clicking. Each line has the action in *italics*.

> **Before you start:** open the app once the day before. Supabase's free tier pauses a database after seven days of inactivity, and a cold start is not a good first impression. Re-run `npm run db:seed` if the demo data needs resetting.

---

**1.** "Health trackers don't fail because they lack features — they fail because logging is tedious. Around 70% of people abandon one within a hundred days, and the reason they give is friction." *Open the landing page.*

**2.** "So the first thing we measured ourselves against is: how fast is it to record something?" *Click **Explore the demo account** — no signup, no inbox.*

**3.** "This is ninety days of history. Rings for movement, energy and water; today's numbers in the user's own timezone." *Land on Today.*

**4.** "Logging is a bar that's always within thumb reach. Watch the water total." *Tap **Water**, tap **Glass** — the total moves from the old value to +250 ml.* "Two taps, no confirm step, and an undo if it was a mistake."

**5.** "Food is where most trackers lose people — wrong numbers from crowdsourced databases. We search USDA and Open Food Facts together, rank lab-verified data first, and label the source on every row." *Tap **Food**, type "banana" — point at the **Verified** badges.*

**6.** "Everything else is here too — sleep, vitals, mood, steps, medication." *Tap **More**, show the tabs, then close.*

**7.** "Over time it looks for patterns. This is the app's own read of ninety days of data." *Go to **Trends** → 90d.* "Shorter nights line up with lower mood — and crucially it tells you it's from 70 days, because a claim from three nights would be noise. If there isn't enough data, it says nothing at all rather than guessing."

**8.** "It's a journal, not a diagnosis. The disclaimer is on every screen, and the safety rules are enforced in the database — you physically cannot store a starvation calorie target, no matter which route you write through." *Point at the disclaimer.*

**9.** "Your data leaves whenever you want. Full JSON or CSV, every table, and import back in." *Go to **Settings** → show the export buttons and the import form.*

**10.** "And the part that's genuinely new: the same data is available to an AI client over MCP." *Scroll to **Connections**.* "You mint a revocable token here, paste it into Claude Desktop, and then you can just say *'log my lunch'* or *'how did I sleep last week?'* — and it reads and writes through the exact same permissions. Not a copy of the data, not a service key: the database enforces that a token only ever sees its owner's rows."

---

## If someone asks a hard question

**"How do you know the AI can't see other users' data?"**
Row-level security, and there's a test that proves it. The test queries deliberately contain no user filter at all — they pass because Postgres refuses. We also ran two tokens side by side: one sees 112 food entries, the other sees zero.

**"Is the calorie maths real?"**
Mifflin–St Jeor for basal rate, the ACSM MET equation for activity burn — both standard, both unit-tested. They're population estimates and the UI says so. The targets they produce are capped at a 20% adjustment and can never go below the person's basal rate.

**"What's missing?"**
Profile editing after onboarding, a medication add screen, Google Fit import, and camera barcode scanning. [LIMITATIONS.md](../LIMITATIONS.md) is a full and honest list — it's worth reading rather than me summarising it.

**"What would this cost to run?"**
Nothing at this scale — Supabase and Vercel free tiers. The first ceiling you'd hit is Supabase's built-in email limit at about four magic links an hour, which needs your own SMTP before real users.
