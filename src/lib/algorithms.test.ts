import { describe, expect, it } from "vitest";
import { EXPECTED, PARTS, SCENARIOS, SCENARIO_ORDER, TEST_PARTS } from "../data/parts";
import { capitalAtMax, capitalNaive, computePolicy, projectedStockoutRate } from "./policy";
import { rankPriority } from "./priority";
import { assignZones } from "./zone";
import { simulatePart } from "./simulate";

const byName = (name: string) => PARTS.find((p) => p.name === name)!;

describe("Algorithm 1 — stock levels (Excel = best case)", () => {
  for (const e of EXPECTED.algorithm1) {
    it(e.name, () => {
      const p = computePolicy(byName(e.name), SCENARIOS.best);
      expect(p.d).toBeCloseTo(e.d, 4);
      expect(p.sigma).toBeCloseTo(e.sigma, 4);
      expect(p.Cu).toBeCloseTo(e.Cu, 6);
      expect(p.Co).toBeCloseTo(e.Co, 6);
      expect(p.criticalRatio).toBeCloseTo(e.criticalRatio, 3);
      expect(p.serviceLevel).toBe(e.serviceLevel);
      expect(p.z).toBeCloseTo(e.z, 4);
      expect([p.MIN, p.ROP, p.EOQ, p.MAX]).toEqual([e.safetyStock, e.rop, e.eoq, e.max]);
    });
  }
});

describe("Algorithm 1 — every scenario", () => {
  for (const id of SCENARIO_ORDER) {
    const exp = EXPECTED.byScenario[id];
    it(`${id}: MIN/ROP/EOQ/MAX`, () => {
      for (const e of exp.algorithm1) {
        const p = computePolicy(byName(e.name), SCENARIOS[id]);
        expect([p.MIN, p.ROP, p.EOQ, p.MAX], e.name).toEqual([e.safetyStock, e.rop, e.eoq, e.max]);
        expect(p.sigmaLTD).toBeCloseTo(e.sigmaLTD, 3);
      }
    });
    it(`${id}: capital and projected stockout rate`, () => {
      const rows = TEST_PARTS.map((part) => ({ part, policy: computePolicy(part, SCENARIOS[id]) }));
      expect(capitalAtMax(rows)).toBe(exp.capitalAtMax);
      expect(Math.abs(capitalNaive(TEST_PARTS) - exp.capitalNaive60Day)).toBeLessThan(100);
      expect(projectedStockoutRate(rows)).toBeCloseTo(exp.projectedStockoutRate, 4);
    });
  }
});

describe("Validation figures", () => {
  it("matches the Excel", () => {
    const rows = TEST_PARTS.map((part) => ({ part, policy: computePolicy(part, SCENARIOS.best) }));
    const v = EXPECTED.validation;
    expect(capitalAtMax(rows)).toBe(v.capitalOurPolicy);
    // Excel used rounded demand, so the naive figure is within ₹100.
    expect(Math.abs(capitalNaive(TEST_PARTS) - v.capitalNaive60Day)).toBeLessThan(100);
    expect(projectedStockoutRate(rows)).toBeCloseTo(v.weightedProjectedStockoutRate, 4);
  });
});

describe("Algorithm 2 — priority", () => {
  it("reproduces the Excel ranking", () => {
    const items = EXPECTED.algorithm2.map((e) => ({ part: byName(e.name), stockOnHand: e.stockOnHand }));
    const rows = rankPriority(items);
    for (const e of EXPECTED.algorithm2) {
      const r = rows.find((x) => x.part.name === e.name)!;
      expect(r.score).toBeCloseTo(e.priorityScore, 3);
      expect(r.rank).toBe(e.rank);
    }
  });
});

describe("Algorithm 3 — zones", () => {
  it("6-part worked example", () => {
    const rows = assignZones(TEST_PARTS);
    for (const e of EXPECTED.algorithm3) {
      const r = rows.find((x) => x.part.name === e.name)!;
      expect(r.zoneScore).toBeCloseTo(e.zoneScore, 2);
      expect(r.zone).toBe(e.zone);
    }
  });
  it("full 20-part catalogue", () => {
    const rows = assignZones(PARTS);
    for (const e of EXPECTED.algorithm3Catalogue) {
      const r = rows.find((x) => x.part.name === e.name)!;
      expect(r.zoneScore).toBeCloseTo(e.zoneScore, 3);
      expect(r.zone).toBe(e.zone);
    }
  });
});

describe("Simulation", () => {
  it("is deterministic", () => {
    const p = TEST_PARTS[0];
    expect(simulatePart(p, "expected", "ours").totals).toEqual(simulatePart(p, "expected", "ours").totals);
  });
});
