import { describe, expect, it } from "vitest";
import { buildChains, closeBlockers, indexLedger, openExceptions, stockDelta, stockOnHand } from "../lib/ledger";
import { EXPECTED, PARTS } from "./parts";
import { buildSeed } from "./seed";

const anchor = new Date(2026, 9, 24, 14, 20).getTime();
const seed = buildSeed(anchor);

describe("seed", () => {
  it("lands on the Excel's stock-on-hand for the 6 test parts", () => {
    const soh = stockOnHand(seed.events);
    for (const e of EXPECTED.algorithm2) {
      const p = PARTS.find((x) => x.name === e.name)!;
      expect(soh[p.id], e.name).toBe(e.stockOnHand);
    }
  });

  it("never goes below zero", () => {
    const bal: Record<string, number> = {};
    for (const e of seed.events) {
      bal[e.partId] = (bal[e.partId] ?? 0) + stockDelta(e);
      expect(bal[e.partId], `${e.partId} ${e.type} ${e.ts}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic", () => {
    expect(buildSeed(anchor).events.length).toBe(seed.events.length);
  });

  it("plants the anomalies", () => {
    const idx = indexLedger(seed.events, seed.jobCards);
    const chains = buildChains(seed.events, idx, anchor);
    expect(chains.filter((c) => c.status === "pending-link")).toHaveLength(1);
    expect(chains.filter((c) => c.status === "unlinked")).toHaveLength(2);
    expect(chains.filter((c) => c.status === "not-billed")).toHaveLength(2);
    const ex = openExceptions(seed.events, chains, anchor);
    expect(ex.filter((e) => e.kind === "count")).toHaveLength(3);
    const open = seed.jobCards.filter((j) => !j.invoicedAt);
    expect(open.length).toBeGreaterThanOrEqual(36);
    expect(open.length).toBeLessThanOrEqual(44);
    const star = seed.jobCards.find((j) => j.id === "JC-24817")!;
    expect(star.technicians).toEqual(["Ravi K."]);
    expect(closeBlockers("JC-24817", chains)).toHaveLength(0);
  });
});
