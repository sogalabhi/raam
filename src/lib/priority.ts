// Algorithm 2: which order to place first. Normalisation is within the set passed in.
import { ASSUMPTIONS, type Assumptions, type Part } from "../data/parts";
import { clamp } from "./stats";

export type PriorityRow = {
  part: Part;
  stockOnHand: number;
  daysLeft: number;
  criticality: number;
  urgency: number;
  exposure: number;
  recovery: number;
  /** Weighted contributions, summing to score. */
  parts: { criticality: number; urgency: number; exposure: number; recovery: number };
  score: number;
  rank: number;
};

export function rankPriority(
  items: { part: Part; stockOnHand: number }[],
  A: Assumptions = ASSUMPTIONS,
): PriorityRow[] {
  if (items.length === 0) return [];
  const W = A.priorityWeights;
  const expo = items.map(({ part }) => part.unitCost * part.emergencyPremium);
  const lo = Math.min(...expo);
  const hi = Math.max(...expo);
  const maxUrgentLT = Math.max(...items.map(({ part }) => part.leadTimeUrgent));
  const rows = items.map(({ part, stockOnHand }, i) => {
    const d = part.D / 365;
    const daysLeft = stockOnHand / d;
    const criticality = A.vedTable[part.ved].weight;
    const urgency = clamp(10 * (1 - daysLeft / part.leadTimeNormal), 0, 10);
    const exposure = hi === lo ? 0 : (10 * (expo[i] - lo)) / (hi - lo);
    const recovery = (10 * part.leadTimeUrgent) / maxUrgentLT;
    const contrib = {
      criticality: W.criticality * criticality,
      urgency: W.urgency * urgency,
      exposure: W.financialExposure * exposure,
      recovery: W.recoveryRisk * recovery,
    };
    const score = contrib.criticality + contrib.urgency + contrib.exposure + contrib.recovery;
    return { part, stockOnHand, daysLeft, criticality, urgency, exposure, recovery, parts: contrib, score, rank: 0 };
  });
  [...rows].sort((a, b) => b.score - a.score).forEach((r, i) => (r.rank = i + 1));
  return rows;
}
