import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkline } from "../components/Sparkline";
import { StockGauge } from "../components/StockGauge";
import { StoreMap } from "../components/StoreMap";
import {
  Button, Card, CountUp, Label, Mono, PageHeader, PartMedallion, Ring, RouteChip, STATUS_COLOR, ScenarioToggle, StatusPill, VedBadge, cx,
} from "../components/ui";
import { TARGETS } from "../config";
import { BINS, zoneOf, zoneScoreOf } from "../data/bins";
import { ASSUMPTIONS, PARTS, SCENARIOS, TEST_PARTS, partById, partBySlug } from "../data/parts";
import { inrShort, pct } from "../lib/format";
import { stockHistory } from "../lib/ledger";
import { capitalAtMax, capitalNaive, stockStatus } from "../lib/policy";
import { averageYears, combineTotals } from "../lib/simulate";
import { STATIC, queryParam, useStore } from "../state/store";

export function ControlTower() {
  const store = useStore();
  const { scenario, setScenario, stock, events, chains, exceptions, now } = store;
  const [selected, setSelected] = useState<string | undefined>(() => partBySlug(queryParam("part") ?? "")?.id);

  const bins = PARTS.map((part) => ({ part, onHand: stock[part.id], policy: store.policy(part.id) }));
  const rows = TEST_PARTS.map((part) => ({ part, policy: store.policies[scenario][part.id] }));
  const capital = capitalAtMax(rows);
  const naive = capitalNaive(TEST_PARTS);

  const [simRate, setSimRate] = useState<number | null>(null);
  useEffect(() => {
    setSimRate(null);
    const id = window.setTimeout(() => setSimRate(combineTotals(TEST_PARTS.map((p) => averageYears(p, scenario, "ours", 40))).emergencyRate), STATIC ? 0 : 700);
    return () => window.clearTimeout(id);
  }, [scenario]);

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const todayChains = chains.filter((c) => new Date(c.issue.ts).getTime() >= dayStart.getTime());
  const unlinkedToday = todayChains.filter((c) => c.issue.type === "ISSUED_UNLINKED");
  const waiting = unlinkedToday.filter((c) => c.status === "pending-link").length;
  const overdue = unlinkedToday.filter((c) => c.status === "unlinked");
  const leak = exceptions.reduce((s, e) => s + e.value, 0);

  const history = useMemo(
    () => Object.fromEntries(TEST_PARTS.map((p) => [p.id, stockHistory(events, p.id, now, 90)])),
    [events, now],
  );
  const needAction = TEST_PARTS.filter((p) => stockStatus(stock[p.id], store.policy(p.id)) !== "healthy").length;

  return (
    <div>
      <PageHeader
        eyebrow="Control Tower · today"
        title={<>{needAction} of 6 watched parts need a decision today.</>}
        right={<ScenarioToggle value={scenario} onChange={setScenario} />}
      />

      <div className="grid grid-cols-4 gap-5">
        <Kpi
          label="Emergency-order rate"
          ring={<Ring value={0.22 / 0.4} marker={TARGETS.emergencyRate / 0.4} color="#C98A12"><span className="text-[11px] text-muted">now</span></Ring>}
          value={<><CountUp value={22} format={(n) => `${Math.round(n)}%`} /><span className="mx-2 text-[30px] text-muted">→</span><span className="text-petrol">≤{TARGETS.emergencyRate * 100}%</span></>}
          sub={<>Our rule, simulated ({SCENARIOS[scenario].label.toLowerCase()}): <span className="font-medium text-petrol">{simRate === null ? "…" : pct(simRate)}</span></>}
        />
        <Kpi
          label="Shrinkage · inventory lost a year"
          ring={<Ring value={ASSUMPTIONS.casebook.shrinkageRate / 0.05} marker={TARGETS.shrinkage / 0.05} color="#C98A12"><span className="text-[11px] text-muted">now</span></Ring>}
          value={<><CountUp value={3} format={(n) => `${Math.round(n)}%`} /><span className="mx-2 text-[30px] text-muted">→</span><span className="text-petrol">≤{TARGETS.shrinkage * 100}%</span></>}
          sub={<>Open leakage register: <span className="text-ink">{inrShort(leak)}</span> across {exceptions.length} items</>}
        />
        <Kpi
          label="Capital at MAX · 6 test parts"
          ring={<Ring value={capital / naive} color="#0E5E63"><span className="text-[11px] text-muted">{Math.round((capital / naive) * 100)}%</span></Ring>}
          value={<span className="text-petrol"><CountUp value={capital} format={inrShort} /></span>}
          sub={<>vs {inrShort(naive)} for a flat 60-day buffer · <span className="text-petrol">{inrShort(naive - capital)} freed</span></>}
        />
        <Kpi
          label="Issued without a job card · today"
          ring={<Ring value={todayChains.length ? 1 - unlinkedToday.length / todayChains.length : 1} color="#0E5E63"><span className="text-[11px] text-muted">{todayChains.length ? Math.round((1 - unlinkedToday.length / todayChains.length) * 100) : 100}%</span></Ring>}
          value={<CountUp value={unlinkedToday.length} format={(n) => `${Math.round(n)}`} />}
          sub={<>{waiting} waiting to link · <span className={overdue.length ? "text-oxblood" : ""}>{overdue.length} overdue ({inrShort(overdue.reduce((s, c) => s + c.value, 0))})</span></>}
        />
      </div>

      <Card className="relative mt-5 h-[540px] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#FFFFFF_0%,#FBFAF7_55%,#F3F1EC_100%)]">
        <div className="absolute left-6 top-5 z-10">
          <Label>Store floor · live bin status</Label>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <Legend color={STATUS_COLOR.healthy}>Healthy</Legend>
            <Legend color={STATUS_COLOR.reorder}>At or below ROP</Legend>
            <Legend color={STATUS_COLOR.critical}>At or below safety stock</Legend>
            <Legend outline>Other catalogue parts</Legend>
          </div>
        </div>
        <div className="absolute inset-0 pb-2 pl-[20px] pr-[390px] pt-[44px]">
          <StoreMap bins={bins} selected={selected} onSelect={setSelected} />
        </div>
        <div className="absolute bottom-5 right-5 top-5 w-[360px]">
          <AnimatePresence mode="wait">
            {selected ? <BinCard key={selected} partId={selected} onClose={() => setSelected(undefined)} /> : <Watchlist key="list" onPick={setSelected} />}
          </AnimatePresence>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-6 gap-4">
        {TEST_PARTS.map((p) => {
          const pol = store.policy(p.id);
          const st = stockStatus(stock[p.id], pol);
          return (
            <button key={p.id} onClick={() => setSelected(p.id)} className={cx("rounded-2xl border bg-white px-4 pb-2 pt-3 text-left shadow-card transition hover:-translate-y-0.5", selected === p.id ? "border-champagne" : "border-hair")}>
              <div className="flex items-baseline justify-between">
                <span className="truncate text-[13px] text-ink">{p.short}</span>
                <span className="font-serif text-[24px] leading-none" style={{ color: STATUS_COLOR[st] }}>{stock[p.id]}</span>
              </div>
              <div className="text-[11px] text-muted">90 days · dashed = ROP {pol.ROP}</div>
              <Sparkline values={history[p.id]} rop={pol.ROP} color="#5E636B" dot={STATUS_COLOR[st]} height={44} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, outline, children }: { color?: string; outline?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cx("inline-block h-2.5 w-2.5 rounded-[3px]", outline && "border border-silver-dark bg-white")} style={color ? { background: color } : undefined} />
      {children}
    </span>
  );
}

function Kpi({ label, ring, value, sub }: { label: string; ring: ReactNode; value: ReactNode; sub: ReactNode }) {
  return (
    <Card className="flex items-center gap-5 px-5 py-5">
      {ring}
      <div className="min-w-0">
        <Label>{label}</Label>
        <div className="mt-1 whitespace-nowrap font-serif text-[46px] leading-none">{value}</div>
        <div className="mt-2 text-[12.5px] leading-snug text-muted">{sub}</div>
      </div>
    </Card>
  );
}

function Watchlist({ onPick }: { onPick: (id: string) => void }) {
  const { stock, policy } = useStore();
  const list = [...TEST_PARTS].sort((a, b) => stock[a.id] / policy(a.id).ROP - stock[b.id] / policy(b.id).ROP);
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.3 }}
      className="flex h-full flex-col rounded-2xl border border-white/70 bg-white/70 p-5 shadow-float backdrop-blur-md">
      <Label>The six worked-example parts</Label>
      <div className="mt-1 text-[12.5px] text-muted">Click a bin or a row for its levels.</div>
      <div className="mt-3 flex-1 space-y-1">
        {list.map((p) => {
          const pol = policy(p.id);
          return (
            <button key={p.id} onClick={() => onPick(p.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white">
              <PartMedallion part={p} size={34} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-ink">{p.short}</div>
                <div className="font-mono text-[11px] text-muted">{BINS[p.id]} · {stock[p.id]} / ROP {pol.ROP}</div>
              </div>
              <StatusPill status={stockStatus(stock[p.id], pol)} short />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function BinCard({ partId, onClose }: { partId: string; onClose: () => void }) {
  const { stock, policy, onOrder } = useStore();
  const navigate = useNavigate();
  const p = partById(partId);
  const pol = policy(partId);
  const zone = zoneOf(partId);
  const po = onOrder[partId];
  return (
    <motion.div initial={{ opacity: 0, x: 16, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full flex-col rounded-2xl border border-white/70 bg-white/75 p-5 shadow-float backdrop-blur-md">
      <div className="flex items-start gap-3.5">
        <PartMedallion part={p} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium leading-tight text-ink">{p.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5"><VedBadge ved={p.ved} /><RouteChip part={p} /></div>
        </div>
        <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-subtle"><X size={16} /></button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <div className="rounded-xl bg-white/80 px-3 py-2"><div className="text-muted">Bin</div><Mono className="text-[13px]">{BINS[partId]}</Mono></div>
        <div className="rounded-xl bg-white/80 px-3 py-2"><div className="text-muted">Zone · score</div><div className="text-ink">{zone === "PRIORITY" ? "Priority cage" : "Servicing"} · {zoneScoreOf(partId).toFixed(2)}</div></div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div><Label>On hand</Label><div className="font-serif text-[52px] leading-none">{stock[partId]}</div></div>
        <StatusPill status={stockStatus(stock[partId], pol)} />
      </div>
      <div className="mt-3"><StockGauge onHand={stock[partId]} policy={pol} /></div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[["MIN", pol.MIN], ["ROP", pol.ROP], ["EOQ", pol.EOQ], ["MAX", pol.MAX]].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-hair bg-white/80 py-1.5"><div className="text-[10.5px] uppercase tracking-label text-muted">{k}</div><div className="font-serif text-[22px] leading-tight">{v}</div></div>
        ))}
      </div>
      <div className="mt-3 text-[12px] text-muted">{po ? <>On order: {po.qty} · arrives {new Date(po.eta!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</> : "Nothing on order"}</div>
      <Button variant="ink" className="mt-auto w-full" onClick={() => navigate(`/planner?part=${p.slug}`)}>Open in Planner <ArrowRight size={15} /></Button>
    </motion.div>
  );
}
