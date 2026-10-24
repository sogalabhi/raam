import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Card, Label, Mono, PageHeader, PartMedallion, RouteChip, ScenarioToggle, StatusPill, VedBadge, cx,
} from "../components/ui";
import { BINS, zoneOf } from "../data/bins";
import { ASSUMPTIONS, PARTS, SCENARIOS, partById, partBySlug, type Part, type ScenarioId } from "../data/parts";
import { num } from "../lib/format";
import { computePolicy, stockStatus, type Policy } from "../lib/policy";
import { simulatePart } from "../lib/simulate";
import { queryParam, useStore } from "../state/store";

const f2 = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const f4 = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 4, minimumFractionDigits: 4 });

export function Planner() {
  const { scenario, setScenario, stock, policy } = useStore();
  const [open, setOpen] = useState<string | undefined>(() => partBySlug(queryParam("part") ?? "")?.id);

  return (
    <div>
      <PageHeader
        eyebrow="Parts Planner · Algorithm 1"
        title="What each part should hold, and why."
        sub="Levels come from consumption, criticality (VED), supplier lead time and how much demand and delivery wobble."
        right={<ScenarioToggle value={scenario} onChange={setScenario} />}
      />
      <Card className="overflow-hidden">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-hair bg-[#FBFAF7] text-[11px] uppercase tracking-label text-muted">
              {["Part", "VED", "Route", "Pattern", "D / yr", "d / day", "Lead", "MIN", "ROP", "MAX", "EOQ", "On hand", "Status"].map((h, i) => (
                <th key={h} className={cx("px-4 py-3 font-medium", i >= 4 && i <= 11 && "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PARTS.map((p, i) => {
              const pol = policy(p.id);
              const sel = open === p.id;
              return (
                <tr key={p.id} onClick={() => setOpen(p.id)} className={cx("cursor-pointer border-b border-hair/70 transition-colors hover:bg-[#FBFAF7]", sel && "bg-champagne-soft/50", i === 5 && "border-b-ink/15")}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <PartMedallion part={p} size={30} />
                      <div>
                        <div className="text-ink">{p.short}{p.isTest && <span className="ml-2 rounded-full bg-champagne-soft px-1.5 py-[1px] text-[10px] uppercase tracking-[0.08em] text-[#7d6238]">Excel</span>}</div>
                        <Mono className="text-[11px] text-muted">{p.code} · {BINS[p.id]}</Mono>
                      </div>
                    </div>
                  </td>
                  <td className="px-4"><VedBadge ved={p.ved} /></td>
                  <td className="px-4"><RouteChip part={p} /></td>
                  <td className="px-4 text-muted">{p.pattern === "Scheduled" ? "Scheduled" : "Failure"}</td>
                  <td className="px-4 text-right font-mono text-[12.5px]">{num(p.D)}</td>
                  <td className="px-4 text-right font-mono text-[12.5px]">{f2(p.D / 365)}</td>
                  <td className="px-4 text-right font-mono text-[12.5px]">{p.leadTimeNormal}d</td>
                  <td className="px-4 text-right font-serif text-[19px]">{pol.MIN}</td>
                  <td className="px-4 text-right font-serif text-[19px]">{pol.ROP}</td>
                  <td className="px-4 text-right font-serif text-[19px]">{pol.MAX}</td>
                  <td className="px-4 text-right font-mono text-[12.5px] text-muted">{pol.EOQ}</td>
                  <td className="px-4 text-right font-serif text-[19px]">{stock[p.id]}</td>
                  <td className="px-4"><StatusPill status={stockStatus(stock[p.id], pol)} short /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <AnimatePresence>{open && <Drawer key={open} part={partById(open)} scenario={scenario} onClose={() => setOpen(undefined)} />}</AnimatePresence>
    </div>
  );
}

function Drawer({ part, scenario, onClose }: { part: Part; scenario: ScenarioId; onClose: () => void }) {
  const { stock } = useStore();
  const [hold, setHold] = useState(ASSUMPTIONS.holdingCostRate);
  const [cv, setCv] = useState(ASSUMPTIONS.demandCV[part.pattern]);
  const [lead, setLead] = useState(part.leadTimeNormal);
  const base = useMemo(() => computePolicy(part, SCENARIOS[scenario]), [part, scenario]);
  const live = useMemo(() => computePolicy(part, SCENARIOS[scenario], { holdingCostRate: hold, demandCV: cv, leadTime: lead }), [part, scenario, hold, cv, lead]);
  const excel = useMemo(() => computePolicy(part, SCENARIOS.best), [part]);
  const changed = hold !== ASSUMPTIONS.holdingCostRate || cv !== ASSUMPTIONS.demandCV[part.pattern] || lead !== part.leadTimeNormal;

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-ink/10 backdrop-blur-[1px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside
        className="scrollbar-thin fixed bottom-0 right-0 top-0 z-50 w-[860px] overflow-y-auto border-l border-hair bg-paper shadow-float"
        initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-hair bg-paper/90 px-8 py-5 backdrop-blur">
          <PartMedallion part={part} size={52} />
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[30px] leading-tight">{part.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <VedBadge ved={part.ved} /><RouteChip part={part} /><span>{part.supplier}</span><span>·</span><Mono>{BINS[part.id]}</Mono>
              <span>· {zoneOf(part.id) === "PRIORITY" ? "Priority cage" : "Servicing racks"}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-subtle"><X size={18} /></button>
        </div>

        <div className="space-y-5 px-8 py-6">
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <Label>Next 90 days under our rule · {SCENARIOS[scenario].label}</Label>
              <span className="text-[12px] text-muted">On hand today: <span className="font-serif text-[20px] text-ink">{stock[part.id]}</span></span>
            </div>
            <Sawtooth part={part} scenario={scenario} policy={base} />
          </Card>

          <Card className="p-6">
            <Label>How we got {base.ROP}</Label>
            <div className="mt-1 text-[13px] text-muted">Reorder point for {part.short}, {SCENARIOS[scenario].label.toLowerCase()} scenario. Every number is from the catalogue or the assumptions sheet.</div>
            <Steps part={part} p={base} scenario={scenario} />
            {scenario !== "best" && (
              <div className="mt-4 rounded-xl bg-subtle/70 px-4 py-2.5 text-[12.5px] text-muted">
                The Excel as built (best case) gives MIN {excel.MIN} · ROP {excel.ROP} · MAX {excel.MAX}. The difference is the extra cover for demand and delivery wobble.
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <Label>Sensitivity · what if?</Label>
              {changed && <button onClick={() => { setHold(ASSUMPTIONS.holdingCostRate); setCv(ASSUMPTIONS.demandCV[part.pattern]); setLead(part.leadTimeNormal); }} className="text-[12px] text-muted underline underline-offset-4 hover:text-ink">Reset</button>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-6">
              <Dial label="Holding cost" value={hold} min={0.1} max={0.35} step={0.01} fmt={(v) => `${Math.round(v * 100)}% / yr`} onChange={setHold} />
              <Dial label="Demand spread (CV)" value={cv} min={0.05} max={0.9} step={0.05} fmt={(v) => v.toFixed(2)} onChange={setCv} />
              <Dial label="Lead time" value={lead} min={1} max={Math.max(90, part.leadTimeNormal * 2)} step={1} fmt={(v) => `${v} days`} onChange={setLead} />
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {(["MIN", "ROP", "EOQ", "MAX"] as const).map((k) => {
                const d = live[k] - base[k];
                return (
                  <div key={k} className="rounded-2xl border border-hair bg-white px-4 py-3">
                    <div className="text-[11px] uppercase tracking-label text-muted">{k}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-[34px] leading-none">{live[k]}</span>
                      {d !== 0 && <span className={cx("text-[12.5px]", d > 0 ? "text-[#8a5e0b]" : "text-petrol")}>{d > 0 ? "+" : ""}{d}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </motion.aside>
    </>
  );
}

function Steps({ part, p, scenario }: { part: Part; p: Policy; scenario: ScenarioId }) {
  const sc = SCENARIOS[scenario];
  const floored = p.varDaily > p.sigma * p.sigma;
  const rows: { k: string; plain: string; f: ReactNode; v: ReactNode }[] = [
    { k: "d", plain: "Daily demand", f: <>D ÷ 365 = {num(part.D)} ÷ 365</>, v: f2(p.d) },
    {
      k: "σ", plain: "Daily spread",
      f: floored ? <>max(CV×d, √d) = max({p.cv}×{f2(p.d)}, √{f2(p.d)})</> : <>CV × d = {p.cv} × {f2(p.d)}</>,
      v: f2(Math.sqrt(p.varDaily)),
    },
    ...(p.sigmaL > 0 ? [{ k: "σL", plain: "Delivery slip", f: <>{Math.round(sc.leadTimeCV[part.route] * 100)}% × L = {Math.round(sc.leadTimeCV[part.route] * 100)}% × {p.L} days</>, v: `${f2(p.sigmaL)} d` }] : []),
    {
      k: "σLT", plain: "Spread over the lead time",
      f: p.sigmaL > 0 || floored ? <>√(L·σ² + d²·σL²) = √({p.L}×{f2(p.varDaily)} + {f2(p.d)}²×{f2(p.sigmaL)}²)</> : <>σ × √L = {f2(p.sigma)} × √{p.L}</>,
      v: f2(p.sigmaLTD),
    },
    { k: "SL", plain: "Service level", f: <>max(critical ratio {p.criticalRatio.toFixed(3)}, {part.ved} floor {p.vedFloor})</>, v: p.serviceLevel.toFixed(2) },
    { k: "z", plain: "Safety factor", f: <>NORMSINV({p.serviceLevel.toFixed(2)})</>, v: f4(p.z) },
    { k: "MIN", plain: "Safety stock", f: <>⌈z × σLT⌉ = ⌈{f4(p.z)} × {f2(p.sigmaLTD)}⌉ = ⌈{f2(p.ssRaw)}⌉</>, v: p.MIN },
    { k: "ROP", plain: "Reorder point", f: <>⌈d × L + z·σLT⌉ = ⌈{f2(p.d * p.L)} + {f2(p.ssRaw)}⌉</>, v: p.ROP },
    { k: "EOQ", plain: "Order size", f: <>⌈√(2·D·S ÷ (h·c))⌉ = ⌈√(2×{num(p.D)}×{num(p.orderingCost)} ÷ {num(p.Co)})⌉</>, v: p.EOQ },
    { k: "MAX", plain: "Order up to", f: <>ROP + EOQ = {p.ROP} + {p.EOQ}</>, v: p.MAX },
  ];
  return (
    <div className="mt-4 divide-y divide-hair/80">
      {rows.map((r) => (
        <div key={r.k} className={cx("grid grid-cols-[64px_170px_1fr_90px] items-baseline gap-3 py-2", r.k === "ROP" && "rounded-lg bg-petrol-soft/50")}>
          <span className="pl-2 font-mono text-[13px] text-ink">{r.k}</span>
          <span className="text-[13px] text-muted">{r.plain}</span>
          <span className="font-mono text-[12.5px] text-ink/80">{r.f}</span>
          <span className={cx("pr-2 text-right font-serif", r.k === "ROP" ? "text-[28px] text-petrol" : ["MIN", "MAX", "EOQ"].includes(r.k) ? "text-[24px]" : "text-[19px]")}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function Dial({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] text-muted">{label}</span>
        <span className="font-serif text-[22px]">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="scrub mt-2 w-full" />
    </div>
  );
}

function Sawtooth({ part, scenario, policy }: { part: Part; scenario: ScenarioId; policy: Policy }) {
  const days = useMemo(() => simulatePart(part, scenario, "ours", 90).days, [part, scenario]);
  const W = 780, H = 190, L = 66, R = 26, T = 10, B = 24;
  const yMax = Math.max(policy.MAX, ...days.map((d) => d.onHand)) * 1.1;
  const x = (i: number) => L + (i / 89) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const path = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.onHand).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
      <rect x={L} width={W - L - R} y={y(policy.MAX)} height={y(policy.MIN) - y(policy.MAX)} fill="#0E5E63" opacity={0.07} />
      {[{ v: policy.MAX, l: "MAX" }, { v: policy.MIN, l: "MIN" }].map((t) => (
        <text key={t.l} x={L - 8} y={y(t.v) + 4} fontSize="11" fill="#5E636B" textAnchor="end">{t.l} {t.v}</text>
      ))}
      <line x1={L} x2={W - R} y1={y(policy.ROP)} y2={y(policy.ROP)} stroke="#0E5E63" strokeDasharray="5 5" opacity={0.7} />
      <text x={W - R - 4} y={y(policy.ROP) - 6} fontSize="11" fill="#0E5E63" textAnchor="end">ROP {policy.ROP}</text>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#DAD7CF" />
      <motion.path d={path} fill="none" stroke="#15171A" strokeWidth={1.6} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeInOut" }} />
      {days.map((d, i) => d.shortfall > 0 && <circle key={i} cx={x(i)} cy={y(0) - 4} r={3} fill="#A3302A" />)}
      {[0, 30, 60, 89].map((d) => <text key={d} x={x(d)} y={H - 6} fontSize="11" fill="#5E636B" textAnchor={d === 89 ? "end" : "middle"}>{d === 89 ? "Day 90" : `Day ${d}`}</text>)}
    </svg>
  );
}
