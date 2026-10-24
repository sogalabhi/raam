# PartTrail: spare-parts control for a luxury service centre

Demo app for the EPiC NGL Casebook 2026, Track 4 (Raam Group). All data is illustrative.

## What each screen proves
| Screen | Route | What it shows the judges |
|---|---|---|
| Issue Counter | `/counter` | "No job card, no part." Closes the verbal-request gap; emergency issues get a 2-hour link deadline |
| Old vs Ours | `/simulate` | Same jobs, two stocking rules: emergency orders 43% → 6%, average stock ₹68 L → ₹30 L (Expected) |
| Control Tower | `/` | KPIs and the store map: Priority cage vs Servicing racks |
| Part Journey | `/trail` | Every unit traced dock → shelf → job card → bill; broken links named |
| Planner | `/planner` | MIN/ROP/MAX per part, with "How we got 157" step by step |
| Reorder | `/reorder` | Which order to place first (reproduces the Excel ranking) |
| Leakage | `/leakage` | Register of open leakage, blind counts, job-card close rule |

**Use first in the deck:** `01-counter-blocked`, `03-simulate-end`, `04-control-tower`.

## Run
```
npm install
npm run dev            # http://localhost:5173
npm test               # algorithms vs parts.json -> expected
npm run build && npm run preview   # then, in another terminal:
npm run shots          # writes screenshots/*.png
```
Useful URLs: `?scenario=best|expected|stress`, `?static=1` (no animation), `/counter?demo=blocked|emergency`, `/simulate?part=all&t=365`, `/planner?part=oil-filter`. Manager PIN for the demo: `4321`. "Reset demo" in the top bar restores the seed.

## Deploy
Push to GitHub → Vercel → Import → Framework: Vite → Deploy (`vercel.json` handles deep links).

See `CHANGES.md` for what changed from the original handoff.
