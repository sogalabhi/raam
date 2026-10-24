# What changed from the original handoff (and why)

The original handoff is kept as `handoff.v1.md`. Everything below is a deliberate change. Nothing in the Excel's numbers was edited.

## 1. The headline is now the Expected case, not the Best case
The Excel assumed two things that make results look better than they will be:
- **Suppliers are always on time.** A German import was assumed to land in exactly 52 or 67 days.
- **Demand is smooth.** For slow, failure-driven parts like the timing chain, the assumed day-to-day variation was about 7× smaller than pure chance.

We now show three scenarios everywhere, with a toggle on the screens:

| Scenario | What it assumes | Capital at MAX (6 parts) | Freed vs ₹1.22 Cr |
|---|---|---|---|
| Best (the Excel) | smooth demand, on-time suppliers | ₹66.4 L | ₹55.5 L |
| **Expected (headline)** | random demand; imports slip ±25%, domestic ±10% | **₹77.3 L** | **₹44.6 L** |
| Stress | random demand; imports slip ±40%, domestic ±20% | ₹82.5 L | ₹39.4 L |

The stockout target stays the same in all three. What changes is how much stock it takes to hit it.

## 2. Why this matters: the Excel's numbers fail in a realistic world
If we keep the Excel's reorder points but demand and deliveries vary as they really do, the simulation gives about **19% emergency orders**. That's close to today's 22%. Sized honestly, the same rule gives about **6%**, averaged over 40 simulated years. This is the strongest honest line for the deck.

## 3. One definition of "emergency rate"
Emergency rate = emergency orders ÷ all orders, which matches the casebook's "22% of orders". The Excel's 11.4% is a different measure (the share of reorder cycles expected to run out), and it is now labelled that way. "Jobs that waited for a part" is shown alongside, because ordering more often can't flatter it.

## 4. The old way is a fixed rule, not tuned to look bad
The handoff said to "calibrate the old way to land near 22%". We dropped that. The old way is now written down: every 30 days, order up to 60 days of last month's usage, with no safety stock. That's the same 60-day buffer used for the capital comparison, and we report whatever it produces. The result: the old way rarely runs out of fast movers, but it holds 2–3× the stock, and it keeps running out of long-lead critical parts. "Wrong mix on the shelf" is exactly the casebook's problem.

## 5. Capital comparison kept, with average stock added
₹66.4 L vs ₹1.22 Cr compares peak with peak, so it's fair and stays in. Using average stock for our side only would have flattered us, so we didn't. The simulation adds average stock on the shelf for both sides: **₹68 L (old) vs ₹30 L (ours)** in the Expected case.

## 6. Store zones ranked against the whole catalogue
Algorithm 3 ranks each part against all 20 parts, not just the 6 in the example, because a percentile within 6 parts doesn't mean much in a 5,000-SKU store. Effect: **Wiper Blades and AGM Battery move from the Priority cage to the Servicing racks.** The 6-part Excel result still passes its test. **Deck action:** update the Excel's zone slide, or say "ranked within the 6-part sample".

## 7. Smaller notes for Q&A
- The critical-ratio step never changes the answer. For every part, the VED floor is higher, so the service level is always the VED floor.
- The simulation starts after a 180-day warm-up, so neither side is judged on its start-up stock.

## Files
- `parts.json`: new blocks only (`assumptions.scenarios`, `oldWay`, `metrics`, `expected.byScenario`, `expected.algorithm3Catalogue`). All v1 values are untouched.
- `handoff.v1.md`: the original handoff.

---
## Appendix: formulas
- Spread of demand over the lead time: `σLT = √(L·σd² + d²·σL²)`, where `σd² = max((CV·d)², d)` in Expected/Stress, and `σL = slip% × L`.
- MIN = ⌈z·σLT⌉, ROP = ⌈d·L + z·σLT⌉, EOQ = ⌈√(2DS/hc)⌉, MAX = ROP + EOQ. With no slip and no demand floor, this is exactly the Excel.
- Excel's 11.4% = Σ(D/EOQ × (1−SL)) ÷ Σ(D/EOQ).
- Simulation: demand ~ Poisson(d) (Best: smooth demand, as in the Excel); each delivery time ~ Normal(L, slip%·L); same demand stream for both policies.
