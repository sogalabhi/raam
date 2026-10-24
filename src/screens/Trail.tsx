import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Card, Label, Mono, PageHeader, PartMedallion, Segmented, cx, useMotionOff } from "../components/ui";
import { OVERRIDE_WINDOW_MIN } from "../config";
import { partById } from "../data/parts";
import { dateTime, duration, inr, inrShort, num } from "../lib/format";
import type { Chain } from "../lib/ledger";
import { queryParam, useStore } from "../state/store";

type Filter = "attention" | "all" | "traced";

export function Trail() {
  const { chains, now, jobCard } = useStore();
  const [q, setQ] = useState(queryParam("q") ?? "");
  const [filter, setFilter] = useState<Filter>("attention");

  const month = useMemo(() => chains.filter((c) => new Date(c.issue.ts).getTime() > now - 30 * 86400000), [chains, now]);
  const units = (list: Chain[]) => list.reduce((s, c) => s + c.issue.qty, 0);
  const broken = month.filter((c) => c.status === "unlinked" || c.status === "not-billed");
  const traced = month.filter((c) => c.status === "traced" || c.status === "returned");
  const progress = month.filter((c) => c.status === "in-progress" || c.status === "pending-link");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let xs = chains;
    if (needle) {
      xs = xs.filter((c) => {
        const p = partById(c.issue.partId);
        return `${p.name} ${p.short} ${c.jobCardId ?? ""} ${c.issue.technician ?? ""} ${c.issue.approver ?? ""}`.toLowerCase().includes(needle);
      });
    }
    const rank = (c: Chain) => (c.status === "unlinked" || c.status === "not-billed" ? 0 : c.status === "pending-link" ? 1 : c.status === "in-progress" ? 2 : 3);
    if (filter === "attention") xs = xs.filter((c) => rank(c) < 3 && c.issue.type === "ISSUED_UNLINKED" || c.status === "not-billed" || c.status === "unlinked");
    if (filter === "traced") xs = xs.filter((c) => c.status === "traced" || c.status === "returned");
    return [...xs].sort((a, b) => rank(a) - rank(b) || (a.issue.ts < b.issue.ts ? 1 : -1)).slice(0, 40);
  }, [chains, q, filter]);

  return (
    <div>
      <PageHeader
        eyebrow="Part Journey · dock to invoice"
        title="Every part, traced from the dock to the bill."
        sub="Each issued unit should complete five links. A missing link is named against the people involved."
        right={
          <div className="flex items-center gap-2 rounded-full border border-hair bg-white px-4 py-2 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
            <Search size={15} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part, job card or technician" className="w-72 bg-transparent text-[14px] outline-none placeholder:text-muted/70" />
          </div>
        }
      />

      <Card className="mb-5 grid grid-cols-[1.25fr_1fr_1fr_1fr_1.3fr] divide-x divide-hair">
        <SummaryCell label="Issued · last 30 days" value={num(units(month))} sub="units across all parts" />
        <SummaryCell label="Fully traced" value={num(units(traced))} sub={`${((units(traced) / Math.max(1, units(month))) * 100).toFixed(1)}% billed or returned`} tone="petrol" />
        <SummaryCell label="In progress" value={num(units(progress))} sub="job still open" />
        <SummaryCell label="Broken" value={num(units(broken))} sub={`units · ${broken.filter((c) => c.status === "unlinked").length} unlinked, ${broken.filter((c) => c.status === "not-billed").length} not billed`} tone="oxblood" />
        <SummaryCell label="Value at risk" value={inrShort(broken.reduce((s, c) => s + c.value, 0))} sub="named, ready to recover" tone="oxblood" />
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "attention", label: "Needs attention" },
            { value: "traced", label: "Traced" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="flex items-center gap-5 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-petrol" /> Done</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-[#c9c5bb] bg-white" /> Waiting</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-oxblood" /> Broken link</span>
        </div>
      </div>

      <div className="space-y-3">
        {list.map((c, i) => <ChainRow key={c.issue.id} c={c} i={i} now={now} model={c.jobCardId ? jobCard(c.jobCardId)?.model : undefined} />)}
        {list.length === 0 && <Card className="p-8 text-center text-muted">Nothing matches.</Card>}
      </div>
    </div>
  );
}

function SummaryCell({ label, value, sub, tone }: { label: string; value: ReactNode; sub: string; tone?: "petrol" | "oxblood" }) {
  return (
    <div className="px-6 py-5">
      <Label>{label}</Label>
      <div className={cx("mt-1 font-serif text-[48px] leading-none", tone === "petrol" ? "text-petrol" : tone === "oxblood" ? "text-oxblood" : "text-ink")}>{value}</div>
      <div className="mt-1.5 text-[12.5px] text-muted">{sub}</div>
    </div>
  );
}

type NodeState = "done" | "wait" | "broken";
type Node = { label: string; state: NodeState; ts?: string; who?: ReactNode };

function nodesFor(c: Chain, now: number): { nodes: Node[]; breakAt?: number; breakText?: ReactNode } {
  const issued = c.issue;
  const nodes: Node[] = [
    { label: "Received", state: c.received ? "done" : "wait", ts: c.received?.ts, who: c.received?.actor },
    { label: "Shelved", state: c.shelved ? "done" : "wait", ts: c.shelved?.ts, who: c.shelved ? <>{c.shelved.actor} · <Mono className="text-[11px]">{c.shelved.bin}</Mono></> : undefined },
    { label: "Issued", state: "done", ts: issued.ts, who: <>{issued.actor} → {issued.technician}</> },
    { label: "Job card", state: "wait" },
    { label: c.returned ? "Returned" : "Billed", state: "wait" },
  ];
  const linkTs = issued.type === "ISSUED" ? issued.ts : c.linked?.ts;
  if (c.jobCardId && linkTs) nodes[3] = { label: "Job card", state: "done", ts: linkTs, who: <Mono className="text-[11.5px]">{c.jobCardId}</Mono> };
  if (c.billed) nodes[4] = { label: "Billed", state: "done", ts: c.billed.ts, who: c.billed.actor };
  if (c.returned) nodes[4] = { label: "Returned", state: "done", ts: c.returned.ts, who: c.returned.reason };

  if (c.status === "unlinked") {
    nodes[3] = { label: "Job card", state: "broken", who: "never linked" };
    const age = duration(now - new Date(issued.ts).getTime());
    return {
      nodes, breakAt: 2,
      breakText: <>Issued on verbal request · not linked · {age}. <span className="text-ink">{issued.technician}</span> took it; <span className="text-ink">{issued.approver}</span> approved.</>,
    };
  }
  if (c.status === "not-billed") {
    nodes[4] = { label: "Billed", state: "broken", who: "missing on invoice" };
    return { nodes, breakAt: 3, breakText: <>Invoice raised without this part. <span className="text-ink">{issued.technician}</span> fitted it on <Mono>{c.jobCardId}</Mono>; job card can't close.</> };
  }
  if (c.status === "pending-link") {
    const left = (c.deadline ?? 0) - now;
    nodes[3] = { label: "Job card", state: "wait", who: <span className="text-[#8a5e0b]">{duration(left)} left to link</span> };
    return { nodes, breakText: <>Emergency issue approved by <span className="text-ink">{issued.approver}</span> · link within {OVERRIDE_WINDOW_MIN / 60}h or it becomes leakage.</> };
  }
  return { nodes };
}

function ChainRow({ c, i, now, model }: { c: Chain; i: number; now: number; model?: string }) {
  const off = useMotionOff();
  const p = partById(c.issue.partId);
  const { nodes, breakAt, breakText } = nodesFor(c, now);
  const broken = breakAt !== undefined;
  const delay = (k: number) => (off ? 0 : Math.min(i, 6) * 0.08 + k * 0.18);
  return (
    <Card className={cx("grid grid-cols-[300px_1fr] items-center overflow-hidden", broken && "border-oxblood/30")}>
      <div className={cx("flex h-full items-center gap-4 border-r border-hair px-5 py-4", broken ? "bg-oxblood-soft/40" : "bg-[#FBFAF7]")}>
        <PartMedallion part={p} size={46} />
        <div className="min-w-0">
          <div className="text-[15px] text-ink">{c.issue.qty}× {p.short}</div>
          <div className="text-[12px] text-muted">{model ? `${model} · ` : ""}{inr(c.value)}</div>
          <div className="mt-1 font-mono text-[11px] text-muted">Ledger #{c.issue.id.replace(/^[EU]/, "")}</div>
        </div>
      </div>
      <div className="px-8 py-4">
        <div className="relative grid grid-cols-5">
          {nodes.map((n, k) => (
            <div key={n.label} className="relative">
              {k < 4 && <Link from={n.state} to={nodes[k + 1].state} snapped={breakAt === k} delay={delay(k)} />}
              <motion.div initial={off ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: delay(k), duration: 0.3 }}
                className={cx(
                  "relative z-10 h-4 w-4 rounded-full border-2",
                  n.state === "done" ? "border-petrol bg-petrol" : n.state === "broken" ? "border-oxblood bg-oxblood shadow-[0_0_0_5px_rgba(163,48,42,.12)]" : "border-[#c9c5bb] bg-white",
                )} />
              <div className="mt-2 pr-4">
                <div className={cx("text-[11px] font-medium uppercase tracking-label", n.state === "broken" ? "text-oxblood" : "text-muted")}>{n.label}</div>
                <div className="font-mono text-[11.5px] text-ink">{n.ts ? dateTime(n.ts) : "—"}</div>
                <div className="truncate text-[12px] text-muted">{n.who ?? ""}</div>
              </div>
            </div>
          ))}
        </div>
        {breakText && (
          <div className={cx("mt-2.5 rounded-lg px-3 py-1.5 text-[12.5px]", broken ? "bg-oxblood-soft/60 text-oxblood" : "bg-amber-soft/70 text-[#8a5e0b]")}>{breakText}</div>
        )}
      </div>
    </Card>
  );
}

function Link({ from, to, snapped, delay }: { from: NodeState; to: NodeState; snapped: boolean; delay: number }) {
  const off = useMotionOff();
  const done = from === "done" && to === "done";
  if (snapped) {
    return (
      <svg className="absolute left-4 top-[1px] h-4 w-[calc(100%-16px)] overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 14">
        <motion.path d="M2 7 L40 7 L44 3" stroke="#A3302A" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: off ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay, duration: 0.4 }} />
        <motion.path d="M56 11 L60 7 L98 7" stroke="#A3302A" strokeWidth="2" strokeDasharray="3 3" fill="none" vectorEffect="non-scaling-stroke"
          initial={{ opacity: off ? 1 : 0 }} animate={{ opacity: 0.55 }} transition={{ delay: delay + 0.4, duration: 0.3 }} />
      </svg>
    );
  }
  return (
    <div className="absolute left-4 right-0 top-[7px] h-[2px]">
      <div className="absolute inset-0 bg-[#E4E1DA]" />
      {done && <motion.div className="absolute inset-y-0 left-0 bg-petrol" initial={{ width: off ? "100%" : 0 }} animate={{ width: "100%" }} transition={{ delay, duration: 0.35, ease: "easeOut" }} />}
    </div>
  );
}
