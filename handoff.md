> **v2 (24 Oct 2026):** headline is now the Expected scenario, there's one emergency-rate definition, the old way is a fixed rule, and zones are ranked across all 20 parts. See `CHANGES.md`. Original: `handoff.v1.md`.

# Handoff: PartTrail, a Spare-Parts Control App (EPiC NGL Casebook 2026, Track 4)

> Paste this whole file into Claude Code as the first message, and put `parts.json` in the project root (or `src/data/`).
> Read everything before writing code. If something is unclear, make the sensible choice and note it in `DECISIONS.md`. Don't stop to ask.

---

## 1. What this is and why it exists

This is for a case competition (Raam Group / EPiC, Track 4: **Spare-Parts Stock Management in Service Centers**), solving for **a luxury (Mercedes-Benz) service centre**. Round 1 is a 5-slide PDF deck. This app serves two purposes:

1. **Screenshots for the deck.** They prove the solution can actually run in a dealership. They must look premium and stay readable at about half a 16:9 slide.
2. **A live demo link** hosted on Vercel.

The casebook names two problems:

| Problem | Casebook number | Our fix (what the app must show) |
|---|---|---|
| Wrong parts on the shelf, so urgent orders at a premium | **22%** of orders become emergency, at a **35–50%** premium (import freight) | A rule-based stocking method: reorder point + min/max, driven by consumption, vehicle mix, criticality (VED) and supplier lead time |
| Pilferage, and stock records not matching the shelf | **~3%** of inventory value lost each year | A tracking chain: **receipt → shelf → job card → bill**, with a log of who did what, and regular reconciliation |
| Total cost | ₹45–55 Lakh per centre per year | KPIs show the ₹ impact |

**The key gap the casebook calls out:** *a part can be handed to a technician on a verbal request before the job card is logged*, so it is never tied to a vehicle or bill. The app must visibly close this gap. This is the single most important screen.

## 2. Hard constraints

- **Frontend only.** No backend, no auth server. It must deploy to Vercel as a static site.
- Stack: **Vite + React + TypeScript + Tailwind CSS**, **Framer Motion** for motion, **Recharts** (or visx) for charts, **lucide-react** icons, **React Router**. The isometric store map is hand-built **SVG**. Don't use three.js.
- Persistence: one versioned object in `localStorage` (`parttrail:v1`), wrapped in try/catch. If the read fails, start from seed data. Put a **"Reset demo"** button in the top bar that restores the seed.
- All maths lives in **pure functions** in `src/lib/` (no React imports). Unit tests (Vitest) check them against `parts.json → expected`.
- **No Mercedes-Benz logo, star emblem, or brand styling.** "Mercedes-Benz" may appear only as plain text in a segment label. The product is called **PartTrail**. Keep the name in one config constant so it's easy to rename. Footer: "Illustrative data — EPiC NGL Casebook 2026, Track 4".
- Mark all numbers as illustrative. Use Indian number formatting (₹12,34,567, and "₹66.4 L" / "₹1.22 Cr" for big values).
- Desktop-first, designed at **1920×1080**. It must still work at 1440 width. The Issue Counter should also have a tablet layout (1180×820), because a storekeeper at a counter would use a tablet.

## 3. Visual direction: "light luxury"

The owner chose **light luxury**: calm, premium, a lot of white space, fine lines. It should feel like a high-end car configurator crossed with a Swiss watch spec sheet. It must not look like a generic admin dashboard. "Crazy visuals" here means **rich, crafted, animated visuals with restraint**, not clutter.

**Tokens (put these in `tailwind.config` / CSS variables):**
- Background `#F6F5F1` (warm paper). Surface cards `#FFFFFF`. Subtle surface `#EFEDE7`.
- Ink `#15171A`. Secondary text `#5E636B`. Hairlines `#DAD7CF` (1px everywhere, no thick borders).
- Silver gradient for chrome details: `#E9EAEC → #B9BDC3`.
- **One accent:** deep petrol `#0E5E63`, used for "good / our policy / healthy".
- Champagne `#B08D57` for highlights and selected states, used sparingly.
- Problems only: amber `#C98A12` (warning) and oxblood red `#A3302A` (stockout / leakage / blocked). **Red means money leaking.** Use it nowhere else.
- Fonts (Google Fonts or @fontsource): **Instrument Serif** for big numbers and page titles (large, elegant), **Inter Tight** for UI text, **JetBrains Mono** for part codes, job-card IDs and timestamps.
- Big numbers: 56–96px serif. Labels: 11–12px uppercase tracking-wide, secondary colour.
- Soft layered shadows (`0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)`), 14–18px radius, a light frosted glass effect on floating panels.
- Motion: ease-out 300–600ms, staggered entry, numbers that count up, charts that draw in. Respect `prefers-reduced-motion`.
- **Each screen has ONE hero visual** plus supporting elements. Screenshots must read at half-slide size, so no tiny dense tables in the hero area.

**App shell:** a slim left rail (icons + labels) and a top bar showing "PartTrail · Luxury Service Centre — Banjara Hills (illustrative)", today's date, a "Demo data" chip and "Reset demo". The current user can be switched from an avatar menu: Storekeeper / Technician / Service Manager. This affects the Issue Counter (only a Manager can approve an override).

## 4. Data

`parts.json` (provided) contains:
- `assumptions`: holding cost 20%/yr; ordering cost ₹500 domestic / ₹5,000 import; demand CV 0.15 scheduled / 0.45 failure-driven; the VED table (service-level floor, priority weight, zone score); Algo 2 and Algo 3 weights; casebook benchmarks.
- `catalogue`: 20 parts with VED class, route (Domestic/Import), pattern (Scheduled/Failure-Driven), `adjAnnualDemand` (**use this as D**), unit cost, normal/urgent lead time, emergency premium, supplier, origin, weight.
- `testSet`: the **6 worked-example parts**. These are the stars of every screen. The other 14 fill the store map and tables.
- `expected`: the Excel's outputs for the 6 parts (Algo 1/2/3 plus validation). **Your functions must reproduce these exactly.**

## 5. The algorithms (port exactly, then test against `expected`)

### Algorithm 1: stock levels (`src/lib/policy.ts`)
For each part, with D = adjAnnualDemand, L = leadTimeNormal (days), c = unitCost, p = emergencyPremium:
```
d      = D / 365                               // daily demand
CV     = pattern == "Scheduled" ? 0.15 : 0.45
σ      = CV * d                                // daily std dev
Cu     = p * c                                 // cost of running short (₹/unit)
Co     = 0.20 * c                              // cost of holding (₹/unit/yr)
CR     = Cu / (Cu + Co)                        // critical ratio
SL     = max(CR, vedFloor[ved])                // Vital .99 · Safety .97 · Essential .90 · Comfort .80
Z      = normInv(SL)                           // implement Acklam's inverse-normal approximation
SS_raw = Z * σ * sqrt(L)
MIN    = ceil(SS_raw)                          // safety stock
ROP    = ceil(d * L + SS_raw)                  // reorder point
S      = route == "Domestic" ? 500 : 5000      // ordering cost
EOQ    = ceil( sqrt(2 * D * S / Co) )
MAX    = ROP + EOQ
```
Check: Engine Oil Filter → MIN 13, ROP 147, EOQ 268, MAX 415. Timing Chain Kit → 1, 8, 7, 15.

### Algorithm 2: which order to place first (`src/lib/priority.ts`)
Run over the current set of parts (min-max normalisation is within that set):
```
daysLeft   = stockOnHand / d
urgency    = clamp(10 * (1 - daysLeft / leadTimeNormal), 0, 10)
exposure   = c * p            → min-max normalise to 0–10 across the set
recovery   = 10 * leadTimeUrgent / max(leadTimeUrgent in set)
weight     = vedWeight[ved]   // Vital 10 · Safety 8 · Essential 5 · Comfort 2
score      = .35*weight + .30*urgency + .20*exposure + .15*recovery
rank       = descending by score
```
With the Excel's test stock (20, 60, 15, 3, 2, 1) the order is: Timing Chain 1, AC Compressor 2, Wiper 3, Battery 4, Oil Filter 5, Cabin Filter 6.

### Algorithm 3: store zone (`src/lib/zone.ts`)
```
pct(x)    = (rankAscending(x) - 1) / (n - 1)       // percentile within the set
zoneScore = .30*vedZoneScore + .25*(1 - pct(D)) + .25*pct(c) + .20*pct(leadTimeNormal)
zone      = zoneScore >= 0.5 ? "PRIORITY" : "SERVICING"
```
PRIORITY = the caged, controlled, high-value/critical area. SERVICING = the open fast-moving racks near the bays.

### Validation figures (show these as "from our model")
- Weighted projected stockout rate **11.4%** vs casebook **22%**.
- Capital tied up at MAX: **₹66.4 L** (our policy) vs **₹1.22 Cr** (flat 60-day buffer), so **₹55.5 L freed**. Be honest that for AC Compressor and Timing Chain our policy holds *more* than the naive buffer. That is deliberate: critical, long-lead parts get more cover. Show those two as a small "we spend more here, on purpose" note.

## 6. Screens (routes)

Build them in this order. ★ marks the deck screenshots, in priority order.

### ★1 `/counter`: Issue Counter (the anti-theft fix, most important)
A full-screen, scanner-style flow with three big steps across the top: **① Job card → ② Part → ③ Technician**.
- **Job card step:** "Scan job card" panel with an animated scan line sweeping over a QR placeholder, plus a searchable list of open job cards (ID, vehicle, reg no., advisor, parts requested).
- **Part step:** scan or choose a bin. Shows a part card: photo-style illustration or icon, VED badge, bin location, on-hand vs ROP gauge, and whether the job card requested this part.
- **Technician step:** must be a technician assigned to that job card.
- Hitting **Issue** writes an `ISSUED` ledger event, decrements stock, and shows a satisfying confirmation (a ✓ morph, plus a slide-in ledger line "14:32 · Lakshmi N. issued 1× Front Brake Pads to Ravi K. against JC-24817").
- **Blocked state (must look striking):** trying to issue with no job card, or a part not on the job card, makes the panel lock with a soft oxblood glow, a short shake, and "No job card, no part." Underneath it gives two choices: "Create job card" or "Emergency issue (manager approval)".
- **Emergency override:** needs a Manager PIN (demo PIN `4321`, shown as a hint) and a reason picker. It then starts a **2-hour countdown ring** (champagne → amber → red) and creates an `ISSUED_UNLINKED` event. If no job card is linked before the deadline, it becomes a red "Unlinked issue" item on the Leakage screen, named against the technician and the approver.
- **Return flow:** a part the job didn't use gets returned with a reason, creating a `RETURNED` event and restoring stock.
- Right sidebar: today's live counter feed (last 10 events) and a "Pending links" list with countdowns.

### ★2 `/simulate`: "Old way vs Our rule" (the business impact visual)
- Pick a part (default: Front Brake Pads, or Wiper Blade Set) or "All 6".
- Two synchronised stock-level charts, stacked: **Old way** and **Our rule**. Each has shaded bands for MIN–MAX (petrol, low opacity) and a dashed ROP line.
- A big **▶ Play** button. 365 days animate in about 12s, with a scrubber. Every emergency order drops a small red ✈ marker with a "+₹x" floating up. Running counters in big serif: **Emergency orders %**, **Premium paid ₹**, **Avg capital tied up ₹**.
- End state: a side-by-side summary card with the deltas.
- Support `?part=<slug>&t=365` so the screenshot script can render the finished state directly.
- **Simulation rules** (`src/lib/simulate.ts`, seeded PRNG such as mulberry32, so results are the same on every run):
  - Daily demand: Scheduled → round(Normal(d, σ)) clipped at ≥0. Failure-Driven → Poisson(d) with occasional bursts (lumpy). For d < 1 use Poisson.
  - **Our rule:** continuous review. When inventory position ≤ ROP, order EOQ, arriving after leadTimeNormal.
  - **Old way:** a monthly manual order of "last month's usage", no safety stock, ignores criticality and lead time.
  - If on-hand can't cover the day's demand, place an **emergency order** for the shortfall at `unitCost × (1+premium)` (it arrives at leadTimeUrgent, but the job is counted as served by the emergency order). Count it as an emergency event.
  - Emergency rate = emergency events ÷ demand events (days with demand > 0).
  - Calibrate the old-way rules only if needed so its rate lands near the casebook's 22%. **Never hard-code the results.** Show what the sim actually produces, plus a small caption "Excel model projects 11.4%".

### ★3 `/` Control Tower (overview hero)
- Top row: 4 KPI cards with thin ring gauges and count-up numbers:
  1. Emergency-order rate: now **22% → target ≤10%**
  2. Shrinkage: **3% → target ≤1%**
  3. Capital in stock: **₹66.4 L** vs ₹1.22 Cr naive
  4. Unlinked issues today (from the ledger)
- Targets live in `src/config.ts`, labelled "team targets".
- **Hero: the isometric store map** (hand-built SVG). The **Priority cage** (a fine champagne mesh outline, controlled access) and the **Servicing racks** near the bays. Each bin is a small isometric box tinted by status: petrol = healthy, amber = at/below ROP, oxblood = at/below MIN, and a hairline silver outline for parts not in the test set. The 6 test parts are labelled. Hovering a bin lifts it slightly. Clicking it opens a frosted card showing MIN/ROP/MAX, on-hand, zone score and "Open in Planner".
- A bottom strip shows small sparkline tiles for the 6 test parts.

### ★4 `/trail`: Part Journey
- Search by part, job card or technician.
- Each issued unit is shown as a horizontal **chain of 5 nodes: Received → Shelved → Issued → Job card → Billed**. Each node shows a timestamp and person. Links draw in one by one.
- A broken chain shows a **snapped link in oxblood** with "Issued on verbal request · not linked · 3h 12m", naming the technician and the approver.
- A summary bar: "1,248 parts issued this month · 1,239 fully traced · 9 broken (₹1.86 L)".

### 5 `/planner`: Parts Planner (Algorithm 1)
- An elegant table of all 20 parts (test-set first): VED badge, route chip, pattern, D, d, lead time, **MIN / ROP / MAX**, EOQ, on-hand, and a status pill.
- Clicking a row opens a right drawer with: a **sawtooth stock chart** (90 days) with the MIN–MAX band and ROP line; a **"How we got 147"** step-by-step breakdown showing each formula line with the real numbers filled in, which is good for judges; a 3-dial sensitivity panel (holding cost %, CV, lead time) that recalculates live.
- Supports `?part=<slug>` to open the drawer directly.

### 6 `/reorder`: Today's Reorder Queue (Algorithm 2)
- An animated **bar race** of priority scores. Bars re-sort with smooth layout animation as stock changes. Each bar is split into its 4 parts (criticality / urgency / exposure / recovery) in shades of petrol and champagne.
- Each row has a "Raise PO" button that creates an `ORDERED` event and shows the expected arrival date.

### 7 `/leakage`: Reconciliation & Leakage
- **Blind cycle count:** the counter enters a shelf quantity *without seeing the system number*. Then the mismatch is revealed with an animated diff. If the mismatch is over the threshold (Priority zone: any mismatch; Servicing: >2%), a **second-person recount** is needed.
- **Count schedule:** Priority-zone parts weekly, Servicing monthly. Show it as a calendar strip.
- **Heatmap:** mismatch % by part (rows) × week (12 columns), from paper white through to oxblood.
- **Flow diagram:** issued units flowing technician → part → Billed / Returned / **Not billed** (oxblood). Clicking "Not billed" lists the job cards.
- **Leakage register:** a table of open exceptions (unlinked issues, issued-not-billed, count mismatches) with ₹ value, person and age. **Job-card close rule:** a job card can't be closed while any issued part is neither billed nor returned. Show a blocked "Close job card" example.

## 7. State and seed data

Ledger event shape:
```ts
type LedgerEvent = {
  id: string; ts: string;            // ISO
  type: "RECEIVED"|"SHELVED"|"ISSUED"|"ISSUED_UNLINKED"|"LINKED"|"RETURNED"|"BILLED"|"COUNTED"|"ORDERED";
  partId: string; qty: number; bin?: string;
  jobCardId?: string; actor: string; technician?: string; approver?: string;
  countedQty?: number; systemQty?: number; note?: string;
}
```
Derive stock on hand and every KPI **from the ledger**. Don't keep a separate stock number.

Seed (`src/data/seed.ts`, deterministic): about 90 days of history for the 6 test parts, plus light activity on the rest. Use **fictional** people: storekeepers Lakshmi N., Joseph D.; technicians Ravi K., Imran S., Suresh P., Anil M., Deepak R., Kiran T.; service manager Meera V. Use about 40 open job cards (`JC-24xxx`, models such as C 220d / E 200 / GLC 300 / GLE 300d, fictional reg nos. like `TS 09 EX 4821`). Plant these anomalies so the Leakage and Trail screens have something to show:
- 3 verbal/unlinked issues (one still counting down, two expired)
- 2 issued-but-not-billed
- 3 cycle-count mismatches (one in the Priority cage)
- Set the Excel's stock-on-hand values (20, 60, 15, 3, 2, 1) as "today", so the Reorder screen matches the Excel ranking.

## 8. Screenshots (a deliverable, not optional)

Add `scripts/shots.ts` (Playwright, run with `npm run shots` against `vite preview`). It writes PNGs to `/screenshots` at **1920×1080, deviceScaleFactor 2**, light theme, animations settled (pass `?static=1` to skip or finish animations):
1. `01-counter-blocked.png`: the Issue Counter in the "No job card, no part" state
2. `02-counter-emergency.png`: emergency override with the countdown ring
3. `03-simulate-end.png`: simulation at day 365 with the summary
4. `04-control-tower.png`
5. `05-trail-broken.png`: a broken chain visible
6. `06-planner-drawer.png`: Oil Filter or Wiper drawer open showing "How we got …"
7. `07-reorder.png`
8. `08-leakage.png`
9. `09-counter-tablet.png` at 1180×820

Use query params or a `?demo=<state>` hook so every state can be reached without clicking.

## 9. Deploy

- `vercel.json` with an SPA rewrite (`{"rewrites":[{"source":"/(.*)","destination":"/"}]}`) so deep links work.
- README: how to run, test, take shots and deploy (push to GitHub → Vercel → Import → Framework: Vite → Deploy).

## 10. Definition of done

- [ ] `npm run test`: policy / priority / zone match `parts.json → expected` for all 6 parts.
- [ ] `npm run build` is clean, with no TS errors.
- [ ] Every screen works at 1920 and 1440, and the counter works at tablet size.
- [ ] Reset demo restores the seed, and the app runs even if localStorage throws.
- [ ] `npm run shots` produces all 9 PNGs. Open each one and check that text is crisp, nothing overlaps, red appears only on problems, and each screen has one clear hero.
- [ ] No Mercedes logos or brand styling. The "illustrative data" footer is present.
- [ ] `DECISIONS.md` lists any choices you made (for example, simulation calibration).
- [ ] Final message to the owner: in simple English, what each screen proves for the deck and which 2–3 screenshots to use first (suggested: counter-blocked, simulate-end, control-tower).

## 11. Known data notes (don't "fix" these silently)

The owner's Excel has a few inconsistencies they will handle in the deck. The app should follow the **Algorithms sheet** (the numbers in `parts.json`):
- D uses the vehicle-mix-adjusted demand (10,000-car parc). An older sheet used about 55% of that.
- Emergency premiums for Engine Oil and Coolant reconcile above the 35–50% band. That doesn't affect the 6 test parts.
- The 11.4% vs 22% comparison is the Excel's own figure. Show it labelled "Excel model projection".