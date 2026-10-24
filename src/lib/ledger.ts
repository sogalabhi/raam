// The ledger is the only source of truth: stock, chains and exceptions are all derived from events.
import { OVERRIDE_WINDOW_MIN } from "../config";
import { PARTS, partById } from "../data/parts";

export type EventType =
  | "RECEIVED" | "SHELVED" | "ISSUED" | "ISSUED_UNLINKED" | "LINKED" | "RETURNED" | "BILLED" | "COUNTED" | "ORDERED";

export type LedgerEvent = {
  id: string;
  ts: string;
  type: EventType;
  partId: string;
  qty: number;
  bin?: string;
  jobCardId?: string;
  actor: string;
  technician?: string;
  approver?: string;
  countedQty?: number;
  systemQty?: number;
  note?: string;
  /** Id of the issue event that a LINKED / BILLED / RETURNED event completes. */
  ref?: string;
  reason?: string;
  /** ORDERED: expected arrival. */
  eta?: string;
  /** COUNTED: second person who confirmed the recount. */
  recountBy?: string;
};

export type JobCardLine = { partId: string; qty: number };

export type JobCard = {
  id: string;
  model: string;
  reg: string;
  advisor: string;
  technicians: string[];
  lines: JobCardLine[];
  openedAt: string;
  invoicedAt?: string;
  closedAt?: string;
  kind: "Service" | "Repair";
};

const ms = (iso: string) => new Date(iso).getTime();
const isIssue = (e: LedgerEvent) => e.type === "ISSUED" || e.type === "ISSUED_UNLINKED";

export function sortEvents(events: LedgerEvent[]): LedgerEvent[] {
  return [...events].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

/** Stock movement of one event. COUNTED moves the books to the counted quantity. */
export function stockDelta(e: LedgerEvent): number {
  switch (e.type) {
    case "RECEIVED":
    case "RETURNED":
      return e.qty;
    case "ISSUED":
    case "ISSUED_UNLINKED":
      return -e.qty;
    case "COUNTED":
      return (e.countedQty ?? 0) - (e.systemQty ?? 0);
    default:
      return 0;
  }
}

export function stockOnHand(events: LedgerEvent[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(PARTS.map((p) => [p.id, 0]));
  for (const e of events) out[e.partId] += stockDelta(e);
  return out;
}

/** Units ordered but not yet received, per part (an ORDERED event is open until a RECEIVED with the same PO note). */
export function onOrder(events: LedgerEvent[]): Record<string, { qty: number; eta?: string }> {
  const out: Record<string, { qty: number; eta?: string }> = {};
  const received = new Set(events.filter((e) => e.type === "RECEIVED" && e.note).map((e) => e.note));
  for (const e of events) {
    if (e.type !== "ORDERED" || received.has(e.note)) continue;
    const cur = out[e.partId] ?? { qty: 0 };
    out[e.partId] = { qty: cur.qty + e.qty, eta: cur.eta && cur.eta < (e.eta ?? "") ? cur.eta : e.eta };
  }
  return out;
}

/** End-of-day stock for the last `days` days, oldest first. Events must be sorted. */
export function stockHistory(events: LedgerEvent[], partId: string, nowMs: number, days: number): number[] {
  const mine = events.filter((e) => e.partId === partId);
  const endToday = new Date(nowMs);
  endToday.setHours(23, 59, 59, 999);
  const out: number[] = [];
  let bal = 0;
  let i = 0;
  for (let k = days - 1; k >= 0; k--) {
    const cut = endToday.getTime() - k * 86400000;
    while (i < mine.length && ms(mine[i].ts) <= cut) bal += stockDelta(mine[i++]);
    out.push(bal);
  }
  return out;
}

export type ChainStatus = "traced" | "returned" | "in-progress" | "pending-link" | "unlinked" | "not-billed";

export type Chain = {
  issue: LedgerEvent;
  received?: LedgerEvent;
  shelved?: LedgerEvent;
  linked?: LedgerEvent;
  billed?: LedgerEvent;
  returned?: LedgerEvent;
  jobCardId?: string;
  status: ChainStatus;
  deadline?: number;
  value: number;
};

export type LedgerIndex = {
  byRef: Map<string, LedgerEvent[]>;
  jobCards: Map<string, JobCard>;
};

export function indexLedger(events: LedgerEvent[], jobCards: JobCard[]): LedgerIndex {
  const byRef = new Map<string, LedgerEvent[]>();
  for (const e of events) {
    if (!e.ref) continue;
    const list = byRef.get(e.ref);
    if (list) list.push(e);
    else byRef.set(e.ref, [e]);
  }
  return { byRef, jobCards: new Map(jobCards.map((j) => [j.id, j])) };
}

/** FIFO: which receipt each issue came from. */
function fifoLots(events: LedgerEvent[]): Map<string, { received: LedgerEvent; shelved?: LedgerEvent }> {
  const out = new Map<string, { received: LedgerEvent; shelved?: LedgerEvent }>();
  const shelvedByNote = new Map<string, LedgerEvent>();
  for (const e of events) if (e.type === "SHELVED" && e.note) shelvedByNote.set(`${e.partId}|${e.note}`, e);
  const perPart = new Map<string, { lots: { e: LedgerEvent; left: number }[] }>();
  for (const e of events) {
    let s = perPart.get(e.partId);
    if (!s) perPart.set(e.partId, (s = { lots: [] }));
    if (e.type === "RECEIVED") s.lots.push({ e, left: e.qty });
    else if (isIssue(e)) {
      while (s.lots.length > 1 && s.lots[0].left <= 0) s.lots.shift();
      const lot = s.lots[0];
      if (lot) {
        lot.left -= e.qty;
        out.set(e.id, { received: lot.e, shelved: shelvedByNote.get(`${e.partId}|${lot.e.note}`) });
      }
    }
  }
  return out;
}

export function buildChains(events: LedgerEvent[], idx: LedgerIndex, nowMs: number): Chain[] {
  const lots = fifoLots(events);
  const chains: Chain[] = [];
  for (const issue of events) {
    if (!isIssue(issue)) continue;
    const related = idx.byRef.get(issue.id) ?? [];
    const linked = related.find((e) => e.type === "LINKED");
    const billed = related.find((e) => e.type === "BILLED");
    const returned = related.find((e) => e.type === "RETURNED");
    const jobCardId = issue.jobCardId ?? linked?.jobCardId;
    const jc = jobCardId ? idx.jobCards.get(jobCardId) : undefined;
    let status: ChainStatus;
    let deadline: number | undefined;
    if (returned) status = "returned";
    else if (issue.type === "ISSUED_UNLINKED" && !linked) {
      deadline = ms(issue.ts) + OVERRIDE_WINDOW_MIN * 60000;
      status = nowMs < deadline ? "pending-link" : "unlinked";
    } else if (billed) status = "traced";
    else if (jc?.invoicedAt) status = "not-billed";
    else status = "in-progress";
    const lot = lots.get(issue.id);
    chains.push({
      issue, received: lot?.received, shelved: lot?.shelved, linked, billed, returned, jobCardId,
      status, deadline, value: issue.qty * partById(issue.partId).unitCost,
    });
  }
  return chains;
}

export type ExceptionKind = "unlinked" | "not-billed" | "count";

export type LeakException = {
  id: string;
  kind: ExceptionKind;
  partId: string;
  qty: number;
  value: number;
  person: string;
  approver?: string;
  jobCardId?: string;
  ts: string;
  note: string;
};

/** Open exceptions: expired unlinked issues, invoiced-but-not-billed parts, and recent count variances. */
export function openExceptions(events: LedgerEvent[], chains: Chain[], nowMs: number, countWindowDays = 14): LeakException[] {
  const out: LeakException[] = [];
  for (const c of chains) {
    if (c.status !== "unlinked" && c.status !== "not-billed") continue;
    out.push({
      id: c.issue.id,
      kind: c.status,
      partId: c.issue.partId,
      qty: c.issue.qty,
      value: c.value,
      person: c.issue.technician ?? c.issue.actor,
      approver: c.issue.approver,
      jobCardId: c.jobCardId,
      ts: c.issue.ts,
      note: c.status === "unlinked" ? c.issue.reason ?? "Issued without a job card" : "Invoice raised without this part",
    });
  }
  const since = nowMs - countWindowDays * 86400000;
  for (const e of events) {
    if (e.type !== "COUNTED" || ms(e.ts) < since) continue;
    const diff = (e.countedQty ?? 0) - (e.systemQty ?? 0);
    if (diff === 0) continue;
    out.push({
      id: e.id,
      kind: "count",
      partId: e.partId,
      qty: diff,
      value: Math.abs(diff) * partById(e.partId).unitCost,
      person: e.actor,
      approver: e.recountBy,
      ts: e.ts,
      note: `Shelf ${e.countedQty} vs system ${e.systemQty}${e.bin ? ` · ${e.bin}` : ""}`,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

/** Job-card close rule: every issued part must be billed or returned. */
export function closeBlockers(jobCardId: string, chains: Chain[]): Chain[] {
  return chains.filter((c) => c.jobCardId === jobCardId && !c.billed && !c.returned);
}
