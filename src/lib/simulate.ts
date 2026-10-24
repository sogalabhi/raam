// "Old way vs Our rule" day-by-day simulation. Seeded, so every run gives the same result.
import { ASSUMPTIONS, SCENARIOS, type Part, type ScenarioId } from "../data/parts";
import { computePolicy, type Policy } from "./policy";
import { normal, poisson, rngFor, type Rng } from "./stats";

export type SimKind = "ours" | "old" | "excel";

export type SimDay = {
  day: number;
  onHand: number;
  demand: number;
  shortfall: number;
  /** Premium paid above normal cost on this day's emergency order (₹). */
  premium: number;
  /** Regular orders placed this day. */
  orders: number;
};

export type SimTotals = {
  regularOrders: number;
  emergencyOrders: number;
  /** emergency orders / all orders — the casebook's "22% of orders". */
  emergencyRate: number;
  demandDays: number;
  shortDays: number;
  /** days with a shortfall / days with demand. */
  jobsWaitingRate: number;
  premiumPaid: number;
  avgCapital: number;
};

export type SimRun = { kind: SimKind; days: SimDay[]; totals: SimTotals };

export const SIM_DAYS = 365;
const WARMUP = 180;

/** Daily demand the world produces, shared by every policy (same jobs arrive on the same days). */
export function demandSeries(part: Part, scenarioId: ScenarioId, n: number, run = 0): number[] {
  const rng = rngFor(`demand|${part.id}|${scenarioId}|${run}`);
  const d = part.D / 365;
  const sigma = ASSUMPTIONS.demandCV[part.pattern] * d;
  const out: number[] = [];
  if (!SCENARIOS[scenarioId].varianceFloor) {
    // The Excel's world: smooth demand with spread CV x d, rounded to whole parts.
    let acc = rng();
    let emitted = 0;
    for (let t = 0; t < n; t++) {
      acc += normal(rng, d, sigma);
      const q = Math.max(0, Math.floor(Math.max(acc, 0)) - emitted);
      emitted += q;
      out.push(q);
    }
    return out;
  }
  for (let t = 0; t < n; t++) {
    out.push(sigma * sigma > d ? Math.max(0, Math.round(normal(rng, d, sigma))) : poisson(rng, d));
  }
  return out;
}

function leadTime(rng: Rng, part: Part, scenarioId: ScenarioId): number {
  const L = part.leadTimeNormal;
  const cv = SCENARIOS[scenarioId].leadTimeCV[part.route];
  return cv === 0 ? L : Math.max(1, Math.round(normal(rng, L, cv * L)));
}

export function simulatePart(part: Part, scenarioId: ScenarioId, kind: SimKind, days = SIM_DAYS, run = 0): SimRun {
  const total = WARMUP + days;
  const demand = demandSeries(part, scenarioId, total, run);
  const ltRng = rngFor(`lead|${part.id}|${scenarioId}|${kind}|${run}`);
  const policy: Policy | null =
    kind === "old" ? null : computePolicy(part, SCENARIOS[kind === "excel" ? "best" : scenarioId]);
  const { reviewDays, coverDays } = ASSUMPTIONS.oldWay;
  const d = part.D / 365;
  const c = part.unitCost;

  let onHand = policy ? policy.MIN + policy.EOQ : Math.round(reviewDays * d);
  const pipeline: { at: number; qty: number }[] = [];
  const usage: number[] = Array(reviewDays).fill(d);

  const log: SimDay[] = [];
  let regularOrders = 0, emergencyOrders = 0, demandDays = 0, shortDays = 0, premiumPaid = 0, capitalSum = 0;

  for (let t = 0; t < total; t++) {
    const measured = t >= WARMUP;
    for (let i = pipeline.length - 1; i >= 0; i--) {
      if (pipeline[i].at === t) {
        onHand += pipeline[i].qty;
        pipeline.splice(i, 1);
      }
    }
    const q = demand[t];
    let shortfall = 0;
    if (q > onHand) {
      shortfall = q - onHand;
      onHand = 0;
    } else onHand -= q;
    usage.push(q);
    usage.shift();

    const premium = shortfall * c * part.emergencyPremium;
    const position = () => onHand + pipeline.reduce((s, o) => s + o.qty, 0);
    let placed = 0;
    if (policy) {
      while (position() <= policy.ROP) {
        pipeline.push({ at: t + leadTime(ltRng, part, scenarioId), qty: policy.EOQ });
        placed++;
      }
    } else if (t % reviewDays === 0) {
      const used = usage.reduce((s, x) => s + x, 0);
      const target = Math.round((coverDays * used) / reviewDays);
      const qty = target - position();
      if (qty > 0) {
        pipeline.push({ at: t + leadTime(ltRng, part, scenarioId), qty });
        placed++;
      }
    }

    if (measured) {
      regularOrders += placed;
      if (q > 0) demandDays++;
      if (shortfall > 0) {
        shortDays++;
        emergencyOrders++;
        premiumPaid += premium;
      }
      capitalSum += onHand * c;
      log.push({ day: t - WARMUP, onHand, demand: q, shortfall, premium, orders: placed });
    }
  }

  return {
    kind,
    days: log,
    totals: {
      regularOrders,
      emergencyOrders,
      emergencyRate: emergencyOrders / Math.max(1, regularOrders + emergencyOrders),
      demandDays,
      shortDays,
      jobsWaitingRate: shortDays / Math.max(1, demandDays),
      premiumPaid,
      avgCapital: capitalSum / days,
    },
  };
}

export function combineTotals(list: SimTotals[]): SimTotals {
  const s = (k: keyof SimTotals) => list.reduce((acc, t) => acc + t[k], 0);
  const regularOrders = s("regularOrders");
  const emergencyOrders = s("emergencyOrders");
  const demandDays = s("demandDays");
  const shortDays = s("shortDays");
  return {
    regularOrders,
    emergencyOrders,
    emergencyRate: emergencyOrders / Math.max(1, regularOrders + emergencyOrders),
    demandDays,
    shortDays,
    jobsWaitingRate: shortDays / Math.max(1, demandDays),
    premiumPaid: s("premiumPaid"),
    avgCapital: s("avgCapital"),
  };
}

/** Average of many simulated years: the expected value rather than one draw. */
const avgCache = new Map<string, SimTotals>();

export function averageYears(part: Part, scenarioId: ScenarioId, kind: SimKind, years = 50): SimTotals {
  const key = `${part.id}|${scenarioId}|${kind}|${years}`;
  const hit = avgCache.get(key);
  if (hit) return hit;
  const runs = Array.from({ length: years }, (_, i) => simulatePart(part, scenarioId, kind, SIM_DAYS, i + 1).totals);
  const pooled = combineTotals(runs);
  const out = { ...pooled, premiumPaid: pooled.premiumPaid / years, avgCapital: pooled.avgCapital / years };
  avgCache.set(key, out);
  return out;
}
