// Deterministic demo history: ~90 days for the 6 test parts, ~30 days for the rest,
// ending at the Excel's stock-on-hand values, with planted leakage anomalies.
import { computePolicy } from "../lib/policy";
import { poisson, rngFor, pick, type Rng } from "../lib/stats";
import type { JobCard, LedgerEvent } from "../lib/ledger";
import { stockDelta } from "../lib/ledger";
import { BINS, zoneOf } from "./bins";
import { EXPECTED, PARTS, SCENARIOS, partById, type Part } from "./parts";
import { ADVISORS, MANAGER, MODELS, STOREKEEPERS, TECHNICIANS } from "./people";

export type Seed = { events: LedgerEvent[]; jobCards: JobCard[]; todayStock: Record<string, number> };

const HISTORY_TEST = 90;
const HISTORY_OTHER = 30;
const MIN = 60000;

const bySlug = (short: string) => PARTS.find((p) => p.short === short)!;

/** Stock on hand "today": the Excel's priority-test values for the 6 test parts, healthy for the rest. */
export function todayTargets(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PARTS) {
    const e = EXPECTED.algorithm2.find((x) => x.name === p.name);
    if (e) out[p.id] = e.stockOnHand;
    else {
      // Healthy under the headline scenario: between ROP and MAX.
      const exp = computePolicy(p, SCENARIOS.expected);
      out[p.id] = Math.min(exp.MAX - 1, exp.ROP + Math.round(exp.EOQ * 0.55));
    }
  }
  return out;
}

function regNo(rng: Rng): string {
  const series = ["EX", "EY", "EZ", "FA", "FB", "FC", "FD", "EU", "EV", "EW"];
  const n = String(1000 + Math.floor(rng() * 9000));
  return `TS ${String(7 + Math.floor(rng() * 9)).padStart(2, "0")} ${pick(rng, series)} ${n}`;
}

export function buildSeed(anchorMs: number): Seed {
  const rng = rngFor("parttrail-seed-v1");
  const midnight = new Date(anchorMs);
  midnight.setHours(0, 0, 0, 0);
  const day0 = midnight.getTime();
  const at = (k: number, h: number, m = 0) => {
    const d = new Date(day0);
    d.setDate(d.getDate() + k);
    d.setHours(h, 0, 0, 0);
    return d.getTime() + m * MIN;
  };
  const iso = (t: number) => new Date(t).toISOString();
  const storekeeperAt = (t: number) => {
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    if (h < 12) return STOREKEEPERS[0];
    if (h >= 16.5) return STOREKEEPERS[1];
    return rng() < 0.5 ? STOREKEEPERS[0] : STOREKEEPERS[1];
  };

  let seq = 0;
  const events: LedgerEvent[] = [];
  const push = (e: Omit<LedgerEvent, "id">) => {
    const ev = { id: `E${++seq}`, ...e } as LedgerEvent;
    events.push(ev);
    return ev;
  };

  type DraftJC = Omit<JobCard, "id"> & { key: string; open?: boolean; issuedAt: Record<string, number | null> };
  const drafts: DraftJC[] = [];
  const newJC = (k: number, kind: JobCard["kind"], openedAt: number, extra: Partial<DraftJC> = {}): DraftJC => {
    const jc: DraftJC = {
      key: `J${drafts.length}`,
      model: pick(rng, MODELS),
      reg: regNo(rng),
      advisor: pick(rng, ADVISORS),
      technicians: [pick(rng, TECHNICIANS)],
      lines: [],
      openedAt: iso(openedAt),
      kind,
      issuedAt: {},
      ...extra,
    };
    void k;
    drafts.push(jc);
    return jc;
  };
  const addLine = (jc: DraftJC, partId: string, qty = 1) => {
    const line = jc.lines.find((l) => l.partId === partId);
    if (line) line.qty += qty;
    else jc.lines.push({ partId, qty });
  };

  // ---- 1. History: job cards built from daily demand -------------------------------------------
  const oilFilter = bySlug("Oil Filter");
  for (let k = -HISTORY_TEST; k <= -1; k++) {
    const services: DraftJC[] = [];
    const serviceCount = poisson(rng, oilFilter.D / 365);
    for (let i = 0; i < serviceCount; i++) {
      const jc = newJC(k, "Service", at(k, 8, 30 + Math.floor(rng() * 300)));
      addLine(jc, oilFilter.id);
      services.push(jc);
    }
    for (const p of PARTS) {
      if (p.id === oilFilter.id) continue;
      if (!p.isTest && k < -HISTORY_OTHER) continue;
      const units = poisson(rng, p.D / 365);
      for (let u = 0; u < units; u++) {
        const repair = p.pattern === "Failure-Driven" || services.length === 0;
        const jc =
          repair && (rng() < 0.6 || services.length === 0)
            ? newJC(k, "Repair", at(k, 8, 40 + Math.floor(rng() * 320)))
            : pick(rng, services);
        addLine(jc, p.id);
      }
    }
  }

  // Planted: two job cards invoiced without one of their parts (issued-not-billed).
  const discs = bySlug("Front Brake Discs");
  const pads = bySlug("Front Brake Pads");
  const mount = bySlug("Engine Mount");
  const coolant = bySlug("Coolant 5L");
  const nb1 = newJC(-2, "Repair", at(-2, 10, 5), { model: "E 220d", technicians: ["Anil M."], advisor: "Vikram J." });
  nb1.lines = [{ partId: pads.id, qty: 1 }, { partId: discs.id, qty: 1 }];
  const nb2 = newJC(-4, "Repair", at(-4, 11, 40), { model: "GLE 300d", technicians: ["Kiran T."], advisor: "Nisha R." });
  nb2.lines = [{ partId: mount.id, qty: 1 }, { partId: coolant.id, qty: 1 }];
  const notBilled = new Map<DraftJC, string>([[nb1, discs.id], [nb2, mount.id]]);

  // Carry-over repairs still in the workshop.
  const carry = drafts.filter((j) => j.kind === "Repair" && new Date(j.openedAt).getTime() >= at(-3, 0) && !notBilled.has(j));
  const carrySet = new Set(carry.filter((_, i) => i % 5 === 0).slice(0, 6));

  // ---- 2. Today: open job cards ----------------------------------------------------------------
  const nowMs = anchorMs;
  const today: DraftJC[] = [];
  const serviceMix = [bySlug("Oil Filter"), bySlug("Engine Oil 5L"), bySlug("Cabin Filter"), bySlug("Wiper Blades")];
  const repairMix = ["Front Brake Pads", "Rear Brake Pads", "AGM Battery", "AC Compressor", "Run-Flat Tyre", "Timing Chain", "Control Arm", "Spark Plugs", "Fuel Filter", "Drive Belt"].map(bySlug);
  for (let i = 0; i < 34; i++) {
    const openedAt = at(0, 8, 40 + Math.round((i / 34) * 320 + rng() * 6));
    const service = rng() < 0.62;
    const jc = newJC(0, service ? "Service" : "Repair", openedAt, { open: true });
    if (service) {
      addLine(jc, serviceMix[0].id);
      addLine(jc, serviceMix[1].id);
      if (rng() < 0.5) addLine(jc, serviceMix[2].id);
      if (rng() < 0.3) addLine(jc, serviceMix[3].id);
    } else {
      addLine(jc, pick(rng, repairMix).id);
      if (rng() < 0.25) addLine(jc, pick(rng, repairMix).id);
    }
    today.push(jc);
  }
  // JC-24817 is the counter's worked example.
  const star = today[16];
  Object.assign(star, { model: "GLC 300", reg: "TS 09 EX 4821", advisor: "Farah A.", technicians: ["Ravi K."], kind: "Repair" });
  star.lines = [{ partId: pads.id, qty: 1 }, { partId: discs.id, qty: 1 }];

  // ---- 3. Issue / bill events for every job card ----------------------------------------------
  const issueEvents = new Map<string, LedgerEvent[]>(); // draft key -> its issues
  for (const jc of drafts) {
    const opened = new Date(jc.openedAt).getTime();
    const isToday = !!jc.open;
    const inWorkshop = isToday || carrySet.has(jc);
    const tech = jc.technicians[0];
    let last = opened;
    const issued: LedgerEvent[] = [];
    jc.lines.forEach((line, li) => {
      let t = opened + (15 + Math.floor(rng() * 75) + li * 6) * MIN;
      if (isToday) {
        // Today's lines: issued if there was time, except the worked example.
        if (jc === star || t > nowMs - 8 * MIN || rng() < 0.22) return;
      }
      t = Math.min(t, at(Math.floor((opened - day0) / 86400000), 19, 30));
      last = Math.max(last, t);
      const p = partById(line.partId);
      issued.push(
        push({ ts: iso(t), type: "ISSUED", partId: p.id, qty: line.qty, bin: BINS[p.id], jobCardId: jc.key, actor: storekeeperAt(t), technician: tech }),
      );
    });
    issueEvents.set(jc.key, issued);
    if (inWorkshop) continue;
    let inv = last + (120 + Math.floor(rng() * 240)) * MIN;
    const invDate = new Date(inv);
    if (invDate.getHours() >= 20) inv = new Date(invDate.setHours(34, 10 + Math.floor(rng() * 50), 0, 0)).getTime();
    if (inv >= nowMs) continue; // still in the workshop
    jc.invoicedAt = iso(inv);
    jc.closedAt = notBilled.has(jc) ? undefined : iso(inv + (25 + Math.floor(rng() * 60)) * MIN);
    for (const e of issued) {
      if (notBilled.get(jc) === e.partId) continue;
      push({ ts: iso(inv), type: "BILLED", partId: e.partId, qty: e.qty, jobCardId: jc.key, actor: jc.advisor, ref: e.id });
    }
  }

  // ---- 4. Planted counter exceptions ----------------------------------------------------------
  const wiper = bySlug("Wiper Blades");
  const battery = bySlug("AGM Battery");
  const unlinked = (t: number, p: Part, qty: number, technician: string, reason: string) =>
    push({ ts: iso(t), type: "ISSUED_UNLINKED", partId: p.id, qty, bin: BINS[p.id], actor: storekeeperAt(t), technician, approver: MANAGER, reason });
  unlinked(nowMs - 48 * MIN, pads, 1, "Imran S.", "Customer waiting — car on lift");
  unlinked(nowMs - 192 * MIN, wiper, 2, "Suresh P.", "Verbal request — job card to follow");
  unlinked(at(-2, 16, 40), battery, 1, "Deepak R.", "Breakdown — car towed in after hours");
  // Two emergency issues that were linked in time: the rule working.
  const okDrafts = drafts.filter((j) => j.invoicedAt && j.kind === "Repair" && !notBilled.has(j));
  for (const [k, partShort] of [[-6, "Rear Brake Pads"], [-11, "AGM Battery"]] as const) {
    const jc = okDrafts.find((j) => new Date(j.openedAt).getTime() >= at(k, 0)) ?? okDrafts[0];
    const p = bySlug(partShort);
    const t = new Date(jc.openedAt).getTime() - 25 * MIN;
    const u = unlinked(t, p, 1, jc.technicians[0], "Customer waiting — job card being opened");
    push({ ts: iso(t + 34 * MIN), type: "LINKED", partId: p.id, qty: 1, jobCardId: jc.key, actor: jc.advisor, ref: u.id });
    push({ ts: jc.invoicedAt!, type: "BILLED", partId: p.id, qty: 1, jobCardId: jc.key, actor: jc.advisor, ref: u.id });
    addLine(jc, p.id);
  }
  // This morning's deliveries, so today's feed shows the whole chain.
  for (const [short, h, m, qty] of [["Run-Flat Tyre", 9, 40, 8], ["Coolant 5L", 11, 10, 40]] as const) {
    const p = bySlug(short);
    const t = at(0, h, m);
    const po = `PO-${p.code.slice(3)}-T${h}`;
    push({ ts: iso(t - p.leadTimeNormal * 86400000), type: "ORDERED", partId: p.id, qty, actor: STOREKEEPERS[0], note: po, eta: iso(t) });
    push({ ts: iso(t), type: "RECEIVED", partId: p.id, qty, actor: STOREKEEPERS[0], note: po });
    push({ ts: iso(t + 35 * MIN), type: "SHELVED", partId: p.id, qty, bin: BINS[p.id], actor: STOREKEEPERS[0], note: po });
  }
  // A few returns of unused parts.
  for (const k of [-3, -9, -17]) {
    const cand = drafts.find((j) => j.invoicedAt && j.kind === "Repair" && new Date(j.openedAt).getTime() >= at(k, 0) && (issueEvents.get(j.key) ?? []).length > 0 && !notBilled.has(j));
    if (!cand) continue;
    const iss = issueEvents.get(cand.key)![0];
    const billed = events.findIndex((e) => e.type === "BILLED" && e.ref === iss.id);
    if (billed >= 0) events.splice(billed, 1);
    push({ ts: iso(new Date(iss.ts).getTime() + 95 * MIN), type: "RETURNED", partId: iss.partId, qty: iss.qty, jobCardId: cand.key, actor: storekeeperAt(new Date(iss.ts).getTime()), technician: iss.technician, ref: iss.id, reason: "Not required — diagnosis changed" });
  }

  // ---- 5. Cycle counts: Priority weekly, Servicing every 4 weeks ------------------------------
  const plannedDelta = new Map<string, number>();
  const plant: [string, number, number][] = [
    ["Front Brake Pads", -3, -1], ["Engine Oil 5L", -6, -2], ["Spark Plugs", -9, -1],
    ["Oil Filter", -62, -3], ["Coolant 5L", -48, -1], ["Run-Flat Tyre", -68, -1],
    ["Cabin Filter", -34, 2], ["Diesel Injector", -40, -1], ["Rear Brake Pads", -27, -1],
  ];
  const counts: LedgerEvent[] = [];
  PARTS.forEach((p, i) => {
    const priority = zoneOf(p.id) === "PRIORITY";
    const every = priority ? 7 : 28;
    const horizon = p.isTest ? 84 : HISTORY_OTHER - 1;
    for (let k = -((i % 6) + 1); k >= -horizon; k -= every) {
      counts.push(push({ ts: iso(at(k, 18, 15 + (i % 4) * 10)), type: "COUNTED", partId: p.id, qty: 0, bin: BINS[p.id], actor: STOREKEEPERS[1] }));
    }
  });
  for (const [short, k, delta] of plant) {
    const p = bySlug(short);
    const mine = counts.filter((e) => e.partId === p.id);
    const target = at(k, 18);
    const c = mine.reduce((best, e) => (Math.abs(new Date(e.ts).getTime() - target) < Math.abs(new Date(best.ts).getTime() - target) ? e : best), mine[0]);
    if (!c) continue;
    plannedDelta.set(c.id, delta);
    if (zoneOf(p.id) === "PRIORITY") c.recountBy = MANAGER;
    if (k < -14) c.note = "Resolved — variance posted";
  }

  // ---- 6. Job card ids ------------------------------------------------------------------------
  const ordered = [...drafts].sort((a, b) => (a.openedAt < b.openedAt ? -1 : 1));
  const todayStart = ordered.findIndex((j) => j.open);
  const idOf = new Map<string, string>();
  ordered.forEach((j, i) => idOf.set(j.key, `JC-${24801 + (i - todayStart)}`));
  for (const e of events) if (e.jobCardId) e.jobCardId = idOf.get(e.jobCardId) ?? e.jobCardId;

  // ---- 7. Receipts placed backwards so today's stock lands exactly on target ------------------
  const targets = todayTargets();
  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  for (const p of PARTS) {
    const policy = computePolicy(p, SCENARIOS.expected);
    const floor = computePolicy(p, SCENARIOS.best).MIN;
    const first = p.isTest ? -HISTORY_TEST : -HISTORY_OTHER;
    const mine = events.filter((e) => e.partId === p.id);
    const delta = (e: LedgerEvent) => (e.type === "COUNTED" ? plannedDelta.get(e.id) ?? 0 : stockDelta(e));
    let bal = targets[p.id];
    const receipts: number[] = [];
    let j = mine.length - 1;
    for (let k = 0; k >= first; k--) {
      const start = at(k, 0);
      while (j >= 0 && new Date(mine[j].ts).getTime() >= start) bal -= delta(mine[j--]);
      if (k < 0 && bal >= policy.EOQ + floor) {
        receipts.push(k);
        bal -= policy.EOQ;
      }
    }
    const lot = (k: number, qty: number, opening: boolean) => {
      const po = `PO-${p.code.slice(3)}-${String(1000 + k + 200).slice(-3)}`;
      const t = at(k, opening ? 7 : 8, opening ? 30 : 15);
      if (!opening && k - p.leadTimeNormal >= first - 30) {
        push({ ts: iso(at(k - p.leadTimeNormal, 10, 20)), type: "ORDERED", partId: p.id, qty, actor: STOREKEEPERS[0], note: po, eta: iso(t) });
      }
      push({ ts: iso(t), type: "RECEIVED", partId: p.id, qty, actor: STOREKEEPERS[0], note: opening ? `OPENING-${p.code}` : po });
      push({ ts: iso(t + (40 + (((k % 5) + 5) % 5) * 20) * MIN), type: "SHELVED", partId: p.id, qty, bin: BINS[p.id], actor: STOREKEEPERS[0], note: opening ? `OPENING-${p.code}` : po });
    };
    if (bal > 0) lot(first - 1, bal, true);
    for (const k of receipts) lot(k, policy.EOQ, false);
  }

  // ---- 8. Fill count quantities with a forward pass -------------------------------------------
  events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  const run: Record<string, number> = {};
  for (const e of events) {
    run[e.partId] ??= 0;
    if (e.type === "COUNTED") {
      e.systemQty = run[e.partId];
      e.countedQty = run[e.partId] + (plannedDelta.get(e.id) ?? 0);
    }
    run[e.partId] += stockDelta(e);
  }

  const jobCards: JobCard[] = ordered.map(({ key, open: _o, issuedAt: _i, ...rest }) => ({ ...rest, id: idOf.get(key)! }));
  return { events, jobCards, todayStock: run };
}
