// Store zones (Algorithm 3 over the full catalogue) and bin codes.
import { assignZones, type Zone, type ZoneRow } from "../lib/zone";
import { PARTS } from "./parts";

export const ZONE_ROWS: ZoneRow[] = assignZones(PARTS);
const byId = new Map(ZONE_ROWS.map((z) => [z.part.id, z]));

export const zoneOf = (partId: string): Zone => byId.get(partId)!.zone;
export const zoneScoreOf = (partId: string) => byId.get(partId)!.zoneScore;

/** Cage bins by zone score (highest first); open racks by demand (fastest nearest the bays). */
export const BINS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  ZONE_ROWS.filter((z) => z.zone === "PRIORITY")
    .sort((a, b) => b.zoneScore - a.zoneScore)
    .forEach((z, i) => (out[z.part.id] = `PZ-${String(i + 1).padStart(2, "0")}`));
  ZONE_ROWS.filter((z) => z.zone === "SERVICING")
    .sort((a, b) => b.part.D - a.part.D)
    .forEach((z, i) => (out[z.part.id] = `SR-${String(i + 1).padStart(2, "0")}`));
  return out;
})();
