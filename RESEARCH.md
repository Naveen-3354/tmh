# RESEARCH.md — Competitive pass

A short review of the reference apps named in the brief, focused on one question: **why do people stop using health trackers, and what should we build differently?**

Sources are listed at the bottom. This is a design input, not a market study.

---

## 1. The apps, in one line each

| App | What it's genuinely good at | Where it loses people |
|---|---|---|
| **MyFitnessPal** | The largest food database on the market; barcode scanning; social proof | Ad clutter on free tier, aggressive upsell prompts, crowdsourced database full of duplicate and wrong entries |
| **Cronometer** | Staff-verified food data (USDA + NCC), full micronutrient panel, genuinely usable free tier | Denser UI, steeper learning curve, less forgiving for casual logging |
| **Apple Health** | Passive aggregation, excellent privacy posture, beautiful typographic charts | Read-mostly; manual logging is buried and tedious; Apple-only |
| **Google Fit** | Effortless passive step/activity capture | Shallow — little depth beyond movement; feature direction has wandered |
| **Bevel / Gyroscope** | Strong visual design, "one number" daily summaries, correlation views | Subscription-gated quickly; correlations sometimes overclaim |
| **Zero** | Single-purpose (fasting) and does it very well; near-zero logging friction | Deliberately narrow scope |
| **Welltory** | Interesting HRV-derived insights | Insight copy strays toward pseudo-diagnostic; heavy paywall |

## 2. What users consistently praise

1. **Speed of logging.** Every positive review of a tracker that survives past month one mentions how fast it is to record something. Zero and Apple Health's ring model are liked because the core action is nearly instantaneous.
2. **Clean, readable charts.** Users respond to charts that answer a question at a glance rather than dashboards that present everything at once.
3. **Data export and ownership.** A recurring theme in enthusiast reviews — people want their history to be portable, and they treat lock-in as a red flag.
4. **Accurate, verified food data.** Cronometer's staff-verified database is the single most cited reason people migrate to it from MyFitnessPal.
5. **Passive capture.** Anything the app records without being asked is valued disproportionately.

## 3. What users consistently complain about

1. **Paywalls moving under them.** MyFitnessPal putting barcode scanning behind Premium in 2024 — then reversing after backlash — is the canonical example. Gating a feature that used to be free costs more trust than never offering it.
2. **Ad clutter and upsell interstitials** on free tiers, breaking the logging flow at exactly the moment the user is trying to complete a task.
3. **Tedious food entry.** Multi-screen flows, searching a cluttered database, resolving duplicate entries with wildly different calorie counts.
4. **Wrong data.** Crowdsourced entries that are not verified; studies have found meaningful discrepancies against USDA reference values for common foods.
5. **Sync failures** — silent, and they destroy trust in the whole dataset.
6. **Guilt mechanics.** Streak-shaming, aggressive deficit targets, and "you failed" copy drive people away rather than back.

## 4. The retention picture

The numbers justify treating friction as the primary design constraint:

- The average fitness app retains roughly **3–4% of users at day 30**.
- A scoping review across lifestyle and mental-health apps found a **median ~70% discontinue within the first 100 days**, with the steepest drop in the **first two weeks**.
- Abandonment research repeatedly names **"complexity" and "time-consuming data entry"** as primary causes of discontinued use.
- Reducing entry friction and automating capture measurably improves retention; adding gamification on top of a habit that hasn't formed does not.

A useful published benchmark: a glucose entry should be **no more than two taps from the home screen**, medication confirmation should be **one tap**, and a daily check-in should take **under 30 seconds**.

## 5. Design decisions we make in response

These are commitments, not aspirations. Each one answers a specific complaint above.

**D1 — Two-tap logging floor, enforced as a rule.**
Every log type is reachable from a persistent quick-add control on the dashboard, and every quick-add completes in at most two taps for the common case (water, mood, medication, a repeated meal, a repeated workout). Anything that cannot meet that bar gets a "recent/favourites" shortcut so the repeat case does. *Answers: tedious entry, complexity-driven abandonment.*

**D2 — Verified nutrition data first, crowdsourced second.**
Food search queries USDA FoodData Central (staff-verified) and Open Food Facts (barcode breadth), and the UI **labels the source of every food row**. When both have a match, the verified one ranks first. *Answers: wrong data, duplicate-entry confusion.*

**D3 — No paywall, no ads, no analytics SDKs — and export is a first-class screen, not a settings footnote.**
Full JSON and CSV export of every table, plus CSV import, plus real account deletion. Nothing about the product depends on trapping the data. *Answers: paywall churn, ad clutter, lock-in anxiety.*

**D4 — Supportive-neutral tone; streaks that never shame.**
Streaks count up and simply reset — no loss-aversion language, no "don't break the chain" pressure, no red failure states for missed days. Goal-setting is clamped to widely accepted healthy ranges and the app refuses to set an aggressive deficit. Missed days render as neutral gaps, not failures. *Answers: guilt mechanics.*

**D5 — Insights are observations about your own data, never diagnoses.**
Correlations are rule-based, always state the window and sample size they are drawn from ("across 14 nights with sleep logged"), suppress themselves below a minimum n, and are phrased as patterns rather than advice. A persistent, non-alarming disclaimer states the app is not a medical device. *Answers: pseudo-diagnostic insight copy; also a safety requirement from the brief.*

**D6 — Optimistic writes with visible rollback.**
A log action commits to the UI immediately and reconciles in the background; a failure surfaces plainly and restores the previous state rather than silently dropping the entry. *Answers: sync failures that erode trust.*

---

## Sources

- [Best MyFitnessPal Alternatives in 2026](https://blog.eatthismuch.com/best-myfitnesspal-alternatives/)
- [MyFitnessPal vs Cronometer 2026: Accuracy, Features, Price](https://www.welling.ai/articles/myfitnesspal-vs-cronometer-2026)
- [Cronometer vs MyFitnessPal 2026: Honest Coach Comparison](https://www.promealplan.com/en/blog/cronometer-vs-myfitnesspal)
- [MyFitnessPal Review: Has the Paywall Gone Too Far?](https://repreturn.com/myfitnesspal-review/)
- [Best Calorie Tracking Apps 2026](https://caloriebliss.com/articles/best-calorie-tracking-apps-2026-myfitnesspal-lose-it-cronometer/)
- [Why Health App Retention Fails in Week One](https://martechvibe.com/article/why-health-app-retention-fails-in-week-one/)
- [Why Most Health App Users Churn Within 90 Days — Sahha](https://sahha.ai/blog/health-app-churn-retention/)
- [JMIR: When and Why Adults Abandon Lifestyle Behavior and Mental Health Mobile Apps (2024)](https://www.jmir.org/2024/1/e56897)
- [Effect of self-monitoring on long-term patient engagement with mHealth apps (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6062090/)
- [User Engagement and Abandonment of mHealth: A Cross-Sectional Survey (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8872344/)
- [Habit-Forming UX for Chronic Disease Mobile Apps](https://www.dogtownmedia.com/how-to-design-habit-forming-mobile-interfaces-for-chronic-disease-management-apps/)
