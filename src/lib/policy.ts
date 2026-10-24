// Algorithm 1: stock levels (MIN / ROP / EOQ / MAX) for one part under a scenario.
import { ASSUMPTIONS, type Assumptions, type Part, type Scenario } from "../data/parts";
import { normInv } from "./stats";

export type PolicyOverrides = {
  holdingCostRate?: number;
  /** Replaces the pattern's demand CV. */
  demandCV?: number;
  leadTime?: number;
};

export type Policy = {
  D: number;
  d: number;
  L: number;
  cv: number;
  sigma: number;
  /** Daily variance actually used (after the scenario's variance floor). */
  varDaily: number;
  sigmaL: number;
  sigmaLTD: number;
  Cu: number;
  Co: number;
  criticalRatio: number;
  vedFloor: number;
  serviceLevel: number;
  z: number;
  ssRaw: number;
  MIN: number;
  ROP: number;
  orderingCost: number;
  EOQ: number;
  MAX: number;
};

export function computePolicy(
  part: Part,
  scenario: Scenario,
  overrides: PolicyOverrides = {},
  A: Assumptions = ASSUMPTIONS,
): Policy {
  const D = part.D;
  const L = overrides.leadTime ?? part.leadTimeNormal;
  const c = part.unitCost;
  const h = overrides.holdingCostRate ?? A.holdingCostRate;
  const d = D / 365;
  const cv = overrides.demandCV ?? A.demandCV[part.pattern];
  const sigma = cv * d;
  const varDaily = scenario.varianceFloor ? Math.max(sigma * sigma, d) : sigma * sigma;
  const sigmaL = scenario.leadTimeCV[part.route] * L;
  // With no floor and no lead-time spread this is exactly the Excel's sigma * sqrt(L).
  const sigmaLTD =
    varDaily === sigma * sigma && sigmaL === 0
      ? sigma * Math.sqrt(L)
      : Math.sqrt(L * varDaily + d * d * sigmaL * sigmaL);
  const Cu = part.emergencyPremium * c;
  const Co = h * c;
  const criticalRatio = Cu / (Cu + Co);
  const vedFloor = A.vedTable[part.ved].floor;
  const serviceLevel = Math.max(criticalRatio, vedFloor);
  const z = normInv(serviceLevel);
  const ssRaw = z * sigmaLTD;
  const MIN = Math.ceil(ssRaw);
  const ROP = Math.ceil(d * L + ssRaw);
  const orderingCost = A.orderingCost[part.route];
  const EOQ = Math.ceil(Math.sqrt((2 * D * orderingCost) / Co));
  return {
    D, d, L, cv, sigma, varDaily, sigmaL, sigmaLTD, Cu, Co, criticalRatio, vedFloor,
    serviceLevel, z, ssRaw, MIN, ROP, orderingCost, EOQ, MAX: ROP + EOQ,
  };
}

/** Excel's "weighted projected stockout rate": share of reorder cycles expected to run out. */
export function projectedStockoutRate(rows: { part: Part; policy: Policy }[]): number {
  let num = 0;
  let den = 0;
  for (const { part, policy } of rows) {
    const orders = part.D / policy.EOQ;
    num += orders * (1 - policy.serviceLevel);
    den += orders;
  }
  return num / den;
}

/** Capital if every part sat at MAX (inventory position, includes stock on order). */
export const capitalAtMax = (rows: { part: Part; policy: Policy }[]) =>
  rows.reduce((s, { part, policy }) => s + policy.MAX * part.unitCost, 0);

/** Capital under a flat N-day buffer for every part. */
export const capitalNaive = (parts: Part[], days = ASSUMPTIONS.naiveBufferDays) =>
  parts.reduce((s, p) => s + (p.D / 365) * days * p.unitCost, 0);

export type StockStatus = "healthy" | "reorder" | "critical";

export function stockStatus(onHand: number, policy: Policy): StockStatus {
  if (onHand <= policy.MIN) return "critical";
  if (onHand <= policy.ROP) return "reorder";
  return "healthy";
}
