import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MANAGER_PIN, STORAGE_KEY } from "../config";
import { BINS } from "../data/bins";
import { HEADLINE_SCENARIO, PARTS, SCENARIOS, partById, type ScenarioId } from "../data/parts";
import { MANAGER, USERS, type Role } from "../data/people";
import { buildSeed } from "../data/seed";
import {
  buildChains, closeBlockers, indexLedger, onOrder, openExceptions, sortEvents, stockOnHand,
  type Chain, type JobCard, type LedgerEvent, type LeakException,
} from "../lib/ledger";
import { computePolicy, type Policy } from "../lib/policy";

type Persisted = {
  v: 1;
  anchorMs: number;
  seededAtReal: number;
  userEvents: LedgerEvent[];
  userJobCards: JobCard[];
  closed: Record<string, string>;
  user: string;
  scenario: ScenarioId;
};

const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
export const STATIC = params.get("static") === "1";

function freshAnchor(): number {
  const d = new Date();
  d.setHours(14, 20, 0, 0);
  return d.getTime();
}

function fresh(): Persisted {
  return {
    v: 1, anchorMs: freshAnchor(), seededAtReal: Date.now(), userEvents: [], userJobCards: [], closed: {},
    user: USERS[0].name, scenario: HEADLINE_SCENARIO,
  };
}

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Persisted;
    if (p.v !== 1 || typeof p.anchorMs !== "number") return fresh();
    return { ...fresh(), ...p };
  } catch {
    return fresh();
  }
}

function save(p: Persisted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the demo still runs from memory */
  }
}

export type Store = {
  now: number;
  anchorMs: number;
  user: { name: string; role: Role };
  setUser: (name: string) => void;
  scenario: ScenarioId;
  setScenario: (s: ScenarioId) => void;
  events: LedgerEvent[];
  jobCards: JobCard[];
  jobCard: (id: string) => JobCard | undefined;
  stock: Record<string, number>;
  onOrder: Record<string, { qty: number; eta?: string }>;
  chains: Chain[];
  exceptions: LeakException[];
  policies: Record<ScenarioId, Record<string, Policy>>;
  policy: (partId: string) => Policy;
  issue: (a: { jobCardId: string; partId: string; qty: number; technician: string }) => LedgerEvent;
  emergencyIssue: (a: { partId: string; qty: number; technician: string; reason: string; pin: string }) => LedgerEvent | null;
  link: (issueId: string, jobCardId: string) => void;
  returnPart: (issueId: string, reason: string) => void;
  raisePO: (partId: string, qty: number, expedite?: boolean) => LedgerEvent;
  count: (partId: string, countedQty: number, recountBy?: string) => LedgerEvent;
  createJobCard: (a: { model: string; reg: string; technician: string; partId?: string }) => JobCard;
  closeJobCard: (id: string) => Chain[];
  reset: () => void;
};

const Ctx = createContext<Store | null>(null);

const POLICIES = Object.fromEntries(
  (Object.keys(SCENARIOS) as ScenarioId[]).map((s) => [
    s,
    Object.fromEntries(PARTS.map((p) => [p.id, computePolicy(p, SCENARIOS[s])])),
  ]),
) as Record<ScenarioId, Record<string, Policy>>;

let uid = 0;
const newId = () => `U${Date.now().toString(36)}${(uid++).toString(36)}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const [tick, setTick] = useState(0);

  useEffect(() => save(state), [state]);
  useEffect(() => {
    if (STATIC) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 15000);
    return () => window.clearInterval(t);
  }, []);

  const scenarioParam = params.get("scenario") as ScenarioId | null;
  const scenario = scenarioParam && SCENARIOS[scenarioParam] ? scenarioParam : state.scenario;

  const now = useMemo(
    () => (STATIC ? state.anchorMs : state.anchorMs + (Date.now() - state.seededAtReal)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.anchorMs, state.seededAtReal, tick, state.userEvents.length],
  );

  const seed = useMemo(() => buildSeed(state.anchorMs), [state.anchorMs]);
  const events = useMemo(() => sortEvents([...seed.events, ...state.userEvents]), [seed, state.userEvents]);
  const jobCards = useMemo(() => {
    const list = [...seed.jobCards, ...state.userJobCards];
    return list.map((j) => (state.closed[j.id] ? { ...j, closedAt: state.closed[j.id], invoicedAt: j.invoicedAt ?? state.closed[j.id] } : j));
  }, [seed, state.userJobCards, state.closed]);
  const jcMap = useMemo(() => new Map(jobCards.map((j) => [j.id, j])), [jobCards]);
  const stock = useMemo(() => stockOnHand(events), [events]);
  const pending = useMemo(() => onOrder(events), [events]);
  const idx = useMemo(() => indexLedger(events, jobCards), [events, jobCards]);
  const chains = useMemo(() => buildChains(events, idx, now), [events, idx, now]);
  const exceptions = useMemo(() => openExceptions(events, chains, now), [events, chains, now]);

  const user = USERS.find((u) => u.name === state.user) ?? USERS[0];
  const add = useCallback((e: Omit<LedgerEvent, "id" | "ts"> & { ts?: string }) => {
    const ev = { id: newId(), ts: new Date(STATIC ? state.anchorMs : state.anchorMs + (Date.now() - state.seededAtReal)).toISOString(), ...e } as LedgerEvent;
    setState((s) => ({ ...s, userEvents: [...s.userEvents, ev] }));
    return ev;
  }, [state.anchorMs, state.seededAtReal]);

  const store: Store = {
    now,
    anchorMs: state.anchorMs,
    user,
    setUser: (name) => setState((s) => ({ ...s, user: name })),
    scenario,
    setScenario: (sc) => {
      if (scenarioParam) {
        const u = new URL(window.location.href);
        u.searchParams.delete("scenario");
        window.history.replaceState(null, "", u);
      }
      setState((s) => ({ ...s, scenario: sc }));
    },
    events,
    jobCards,
    jobCard: (id) => jcMap.get(id),
    stock,
    onOrder: pending,
    chains,
    exceptions,
    policies: POLICIES,
    policy: (partId) => POLICIES[scenario][partId],
    issue: ({ jobCardId, partId, qty, technician }) =>
      add({ type: "ISSUED", partId, qty, jobCardId, technician, bin: BINS[partId], actor: user.name }),
    emergencyIssue: ({ partId, qty, technician, reason, pin }) => {
      if (pin !== MANAGER_PIN) return null;
      return add({ type: "ISSUED_UNLINKED", partId, qty, technician, reason, approver: MANAGER, bin: BINS[partId], actor: user.name });
    },
    link: (issueId, jobCardId) => {
      const issue = events.find((e) => e.id === issueId);
      if (!issue) return;
      add({ type: "LINKED", partId: issue.partId, qty: issue.qty, jobCardId, ref: issueId, actor: user.name });
    },
    returnPart: (issueId, reason) => {
      const issue = events.find((e) => e.id === issueId);
      if (!issue) return;
      const jc = issue.jobCardId ?? idx.byRef.get(issueId)?.find((e) => e.type === "LINKED")?.jobCardId;
      add({ type: "RETURNED", partId: issue.partId, qty: issue.qty, jobCardId: jc, technician: issue.technician, ref: issueId, reason, actor: user.name, bin: BINS[issue.partId] });
    },
    raisePO: (partId, qty, expedite = false) => {
      const p = partById(partId);
      const eta = now + (expedite ? p.leadTimeUrgent : p.leadTimeNormal) * 86400000;
      return add({ type: "ORDERED", partId, qty, actor: user.name, note: `PO-${p.code.slice(3)}-${String(Date.now()).slice(-4)}`, eta: new Date(eta).toISOString(), reason: expedite ? "Expedited" : undefined });
    },
    count: (partId, countedQty, recountBy) =>
      add({ type: "COUNTED", partId, qty: 0, countedQty, systemQty: stock[partId], bin: BINS[partId], actor: user.name, recountBy }),
    createJobCard: ({ model, reg, technician, partId }) => {
      const n = Math.max(...jobCards.map((j) => Number(j.id.slice(3)) || 0)) + 1;
      const jc: JobCard = {
        id: `JC-${n}`, model, reg, advisor: "Farah A.", technicians: [technician],
        lines: partId ? [{ partId, qty: 1 }] : [], openedAt: new Date(now).toISOString(), kind: "Repair",
      };
      setState((s) => ({ ...s, userJobCards: [...s.userJobCards, jc] }));
      return jc;
    },
    closeJobCard: (id) => {
      const blockers = closeBlockers(id, chains);
      if (blockers.length === 0) setState((s) => ({ ...s, closed: { ...s.closed, [id]: new Date(now).toISOString() } }));
      return blockers;
    },
    reset: () => {
      const f = fresh();
      setState({ ...f, user: state.user });
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

/** Live demo clock for countdowns (ticks every second unless static). */
export function useClock(): number {
  const { now } = useStore();
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (STATIC) return;
    const start = Date.now();
    const t = window.setInterval(() => setOffset(Date.now() - start), 1000);
    return () => window.clearInterval(t);
  }, [now]);
  return now + offset;
}

export const queryParam = (key: string) => new URLSearchParams(window.location.search).get(key);
