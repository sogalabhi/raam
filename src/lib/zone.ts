// Algorithm 3: PRIORITY cage or SERVICING racks. Percentiles are within the set passed in.
import { ASSUMPTIONS, type Assumptions, type Part } from "../data/parts";

export type Zone = "PRIORITY" | "SERVICING";
export type ZoneRow = { part: Part; zoneScore: number; zone: Zone };

/** (rank ascending - 1) / (n - 1); ties take the lower rank, like Excel RANK.EQ. */
function percentile(values: number[], x: number): number {
  const below = values.filter((v) => v < x).length;
  return below / (values.length - 1);
}

export function assignZones(parts: Part[], A: Assumptions = ASSUMPTIONS): ZoneRow[] {
  const Z = A.zoneWeights;
  const Ds = parts.map((p) => p.D);
  const Cs = parts.map((p) => p.unitCost);
  const Ls = parts.map((p) => p.leadTimeNormal);
  return parts.map((part) => {
    const zoneScore =
      Z.criticality * A.vedTable[part.ved].zoneScore +
      Z.consumption * (1 - percentile(Ds, part.D)) +
      Z.cost * percentile(Cs, part.unitCost) +
      Z.leadTime * percentile(Ls, part.leadTimeNormal);
    return { part, zoneScore, zone: zoneScore >= Z.priorityThreshold ? "PRIORITY" : "SERVICING" };
  });
}
