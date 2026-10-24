import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, Plane, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Label, PageHeader, ScenarioToggle, cx } from "../components/ui";
import { EXPECTED, PARTS, SCENARIOS, TEST_PARTS, partBySlug, type Part, type ScenarioId } from "../data/parts";
import { inrShort, num, pct } from "../lib/format";
import { computePolicy } from "../lib/policy";
import { SIM_DAYS, averageYears, combineTotals, simulatePart, type SimDay, type SimKind, type SimTotals } from "../lib/simulate";
import { STATIC, queryParam, useStore } from "../state/store";

const PLAY_MS = 12000;
const PICKS: (Part | "all")[] = ["all", ...TEST_PARTS, PARTS.find((p) => p.short === "Front Brake Pads")!];

type Series = { value: number[]; markers: { day: number; premium: number }[]; cum: { reg: number[]; em: number[]; prem: number[]; cap: number[] } };

function series(runs: SimDay[][], parts: Part[], asValue: boolean): Series {
  const n = SIM_DAYS;
  const value = Array(n).fill(0);
  const markers: { day: number; premium: number }[] = [];
  const reg = Array(n).fill(0), em = Array(n).fill(0), prem = Array(n).fill(0), cap = Array(n).fill(0);
  for (let t = 0; t < n; t++) {
    let p = 0, r = 0, e = 0, c = 0;
    runs.forEach((days, i) => {
      const d = days[t];
      value[t] += asValue ? d.onHand * parts[i].unitCost : d.onHand;
      p += d.premium;
      r += d.orders;
      e += d.shortfall > 0 ? 1 : 0;
      c += d.onHand * parts[i].unitCost;
    });
    if (e > 0) markers.push({ day: t, premium: p });
    reg[t] = (t ? reg[t - 1] : 0) + r;
    em[t] = (t ? em[t - 1] : 0) + e;
    prem[t] = (t ? prem[t - 1] : 0) + p;
    cap[t] = (t ? cap[t - 1] : 0) + c;
  }
  return { value, markers, cum: { reg, em, prem, cap } };
}

export function Simulate() {
  const { scenario, setScenario } = useStore();
  const initialPick = (() => {
    const q = queryParam("part");
    if (!q || q === "all") return "all" as const;
    return partBySlug(q) ?? ("all" as const);
  })();
  const [pick, setPick] = useState<Part | "all">(initialPick);
  const tParam = Number(queryParam("t"));
  const [t, setT] = useState(STATIC ? SIM_DAYS : Number.isFinite(tParam) && tParam > 0 ? Math.min(SIM_DAYS, tParam) : 0);
  const [playing, setPlaying] = useState(!STATIC && !(tParam > 0));
  const raf = useRef<number>();

  const parts = pick === "all" ? TEST_PARTS : [pick];
  const asValue = pick === "all";

  const data = useMemo(() => {
    const run = (k: SimKind) => parts.map((p) => simulatePart(p, scenario, k));
    const old = run("old"), ours = run("ours"), excel = run("excel");
    return {
      old: series(old.map((r) => r.days), parts, asValue),
      ours: series(ours.map((r) => r.days), parts, asValue),
      totals: {
        old: combineTotals(old.map((r) => r.totals)),
        ours: combineTotals(ours.map((r) => r.totals)),
        excel: combineTotals(excel.map((r) => r.totals)),
      },
    };
  }, [scenario, pick]); // eslint-disable-line react-hooks/exhaustive-deps

  const [avg, setAvg] = useState<Record<SimKind, SimTotals> | null>(null);
  useEffect(() => {
    setAvg(null);
    const id = window.setTimeout(() => {
      const k = (kind: SimKind) => combineTotals(parts.map((p) => averageYears(p, scenario, kind, 40)));
      setAvg({ old: k("old"), ours: k("ours"), excel: k("excel") });
    }, STATIC ? 0 : 400);
    return () => window.clearTimeout(id);
  }, [scenario, pick]); // eslint-disable-line react-hooks/exhaustive-deps

  const band = useMemo(() => {
    const pol = parts.map((p) => computePolicy(p, SCENARIOS[scenario]));
    const sum = (f: (i: number) => number) => pol.reduce((s, _, i) => s + f(i), 0);
    return asValue
      ? { min: sum((i) => pol[i].MIN * parts[i].unitCost), max: sum((i) => pol[i].MAX * parts[i].unitCost), rop: null as number | null }
      : { min: pol[0].MIN, max: pol[0].MAX, rop: pol[0].ROP as number | null };
  }, [scenario, pick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setT((x) => {
        const nx = Math.min(SIM_DAYS, x + (dt / PLAY_MS) * SIM_DAYS);
        if (nx >= SIM_DAYS) setPlaying(false);
        return nx;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current!);
  }, [playing]);

  const restart = () => { setT(0); setPlaying(true); };
  useEffect(() => { if (!STATIC) restart(); }, [scenario, pick]); // eslint-disable-line react-hooks/exhaustive-deps

  const yMax = Math.max(band.max, ...data.old.value, ...data.ours.value) * 1.08;
  const day = Math.floor(t);
  const ended = t >= SIM_DAYS;

  return (
    <div>
      <PageHeader
        eyebrow="Old way vs Our rule · one simulated year"
        title="Same jobs. Two ways of stocking."
        sub="Both stores face the same jobs on the same days. Only the ordering rule changes. Nothing is calibrated to the casebook."
        right={<ScenarioToggle value={scenario} onChange={setScenario} />}
      />

      <div className="mb-5 flex items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {PICKS.map((p) => {
            const key = p === "all" ? "all" : p.id;
            const active = (pick === "all" ? "all" : pick.id) === key;
            return (
              <button key={key} onClick={() => setPick(p)} className={cx("rounded-full border px-3.5 py-1.5 text-[13px] transition", active ? "border-ink bg-ink text-white" : "border-hair bg-white text-ink hover:border-[#c9c5bb]")}>
                {p === "all" ? "All 6 test parts" : p.short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_400px] gap-6">
        <Card className="p-6">
          <div className="mb-2 flex items-center gap-4">
            <button
              onClick={() => (ended ? restart() : setPlaying((p) => !p))}
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink text-white shadow-card transition hover:scale-[1.03]"
              aria-label={playing ? "Pause" : "Play"}
            >
              {ended ? <RotateCcw size={20} /> : playing ? <Pause size={20} /> : <Play size={22} className="ml-0.5" />}
            </button>
            <div className="w-[120px]">
              <Label>Day</Label>
              <div className="font-serif text-[34px] leading-none">{day}<span className="text-[18px] text-muted"> / {SIM_DAYS}</span></div>
            </div>
            <input type="range" min={0} max={SIM_DAYS} step={1} value={day} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} className="scrub flex-1" />
            <div className="w-[170px] text-right text-[12px] leading-snug text-muted">{asValue ? "₹ value on the shelf, 6 parts" : `Units on the shelf · ${(pick as Part).short}`}</div>
          </div>
          <Chart title="Old way" rule="Monthly order of last month's usage, up to 60 days of cover. No safety stock; ignores lead time." s={data.old} t={t} yMax={yMax} band={band} asValue={asValue} tone="ink" />
          <div className="h-3" />
          <Chart title="Our rule" rule="Reorder the moment stock hits ROP; order EOQ. Levels set by criticality, lead time and demand spread." s={data.ours} t={t} yMax={yMax} band={band} asValue={asValue} tone="petrol" />
        </Card>

        <div className="flex flex-col gap-4">
          <Counters data={data} t={t} ended={ended} />
          <AnimatePresence>
            {ended && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <Card className="p-5">
                  <Label>How sure are we?</Label>
                  <div className="mt-3 space-y-2.5 text-[13.5px] leading-snug">
                    <Row l="Average of 40 simulated years" old={avg ? pct(avg.old.emergencyRate) : "…"} ours={avg ? pct(avg.ours.emergencyRate) : "…"} />
                    <Row l="Jobs that waited for a part" old={pct(data.totals.old.jobsWaitingRate)} ours={pct(data.totals.ours.jobsWaitingRate)} />
                    <div className="flex items-baseline justify-between border-t border-hair pt-2.5">
                      <span className="text-muted">Excel's original ROPs in this world</span>
                      <span className="font-serif text-[20px] text-amber">{avg ? pct(avg.excel.emergencyRate) : "…"}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                    Emergency rate = emergency orders ÷ all orders. Excel model projects {pct(EXPECTED.validation.weightedProjectedStockoutRate)} (per reorder). Casebook today: 22%, centre-wide across ~5,000 SKUs.
                  </p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="px-1 text-[12px] leading-relaxed text-muted">
            <span className="font-medium text-ink">{SCENARIOS[scenario].label}:</span> {SCENARIOS[scenario].description}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ l, old, ours }: { l: string; old: string; ours: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{l}</span>
      <span className="whitespace-nowrap"><span className="text-ink/60">{old}</span> <span className="text-muted">→</span> <span className="font-medium text-petrol">{ours}</span></span>
    </div>
  );
}

function Counters({ data, t, ended }: { data: { old: Series; ours: Series; totals: { old: SimTotals; ours: SimTotals } }; t: number; ended: boolean }) {
  const i = Math.max(0, Math.min(SIM_DAYS - 1, Math.floor(t) - 1));
  const started = t >= 1;
  const rate = (s: Series) => (started ? s.cum.em[i] / Math.max(1, s.cum.em[i] + s.cum.reg[i]) : 0);
  const items = [
    { label: "Emergency orders", sub: "share of all orders", old: rate(data.old), ours: rate(data.ours), fmt: (x: number) => pct(x) },
    { label: "Premium paid", sub: "above normal price", old: started ? data.old.cum.prem[i] : 0, ours: started ? data.ours.cum.prem[i] : 0, fmt: inrShort },
    { label: "Avg capital on the shelf", sub: "6-part stock value", old: started ? data.old.cum.cap[i] / (i + 1) : 0, ours: started ? data.ours.cum.cap[i] / (i + 1) : 0, fmt: inrShort },
  ];
  return (
    <Card className="divide-y divide-hair">
      {items.map((it) => {
        const better = it.ours <= it.old;
        return (
          <div key={it.label} className="px-5 py-4">
            <div className="flex items-baseline justify-between">
              <Label>{it.label}</Label>
              {ended && (
                <span className={cx("rounded-full px-2 py-[2px] text-[11.5px] font-medium", better ? "bg-petrol-soft text-petrol" : "bg-amber-soft text-[#8a5e0b]")}>
                  {it.old > 0 ? `${better ? "−" : "+"}${Math.abs(Math.round((1 - it.ours / it.old) * 100))}%` : "—"}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-muted">Old way</div>
                <div className="font-serif text-[40px] leading-none text-ink/70">{it.fmt(it.old)}</div>
              </div>
              <div>
                <div className="text-[11px] text-petrol">Our rule</div>
                <div className="font-serif text-[40px] leading-none text-petrol">{it.fmt(it.ours)}</div>
              </div>
            </div>
          </div>
        );
      })}
      <div className="px-5 py-3 text-[11.5px] text-muted">
        Orders placed: old {num(data.old.cum.reg[Math.max(0, Math.floor(t) - 1)])} · ours {num(data.ours.cum.reg[Math.max(0, Math.floor(t) - 1)])}
      </div>
    </Card>
  );
}

const W = 1000;
const H = 188;
const PAD = { l: 64, r: 12, t: 14, b: 30 };

function Chart({ title, rule, s, t, yMax, band, asValue, tone }: {
  title: string; rule: string; s: Series; t: number; yMax: number; band: { min: number; max: number; rop: number | null }; asValue: boolean; tone: "ink" | "petrol";
}) {
  const x = (d: number) => PAD.l + (d / SIM_DAYS) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (H - PAD.t - PAD.b);
  const n = Math.max(1, Math.min(SIM_DAYS, Math.ceil(t)));
  let path = "";
  for (let d = 0; d < n; d++) path += `${d ? "L" : "M"}${x(d).toFixed(1)},${y(s.value[d]).toFixed(1)}`;
  const area = `${path}L${x(n - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
  const color = tone === "petrol" ? "#0E5E63" : "#3A3F46";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax / 1.08);
  const shown = s.markers.filter((m) => m.day < t);
  const recent = shown.filter((m) => t - m.day < 22 && t < SIM_DAYS);
  const em = shown.length;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-6">
        <div className="flex items-baseline gap-3">
          <span className={cx("font-serif text-[26px] leading-none", tone === "petrol" ? "text-petrol" : "text-ink")}>{title}</span>
          <span className="text-[12.5px] text-muted">{rule}</span>
        </div>
        <span className="flex shrink-0 items-center gap-4 whitespace-nowrap text-[12.5px]">
          {tone === "ink" && <span className="flex items-center gap-1.5 text-muted"><span className="inline-block h-2.5 w-4 rounded-sm bg-petrol/15" /> Our MIN–MAX band</span>}
          <span className={em ? "text-oxblood" : "text-muted"}><Plane size={12} className="mr-1 inline -rotate-45" />{em} emergency day{em === 1 ? "" : "s"}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id={`fill-${tone}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.14} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#EFEDE7" />
            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5E636B">{asValue ? inrShort(v) : num(v)}</text>
          </g>
        ))}
        <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(band.max)} height={Math.max(0, y(band.min) - y(band.max))} fill="#0E5E63" opacity={0.07} />
        {band.rop !== null && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(band.rop)} y2={y(band.rop)} stroke="#0E5E63" strokeDasharray="5 5" strokeWidth={1} opacity={0.6} />
            <text x={PAD.l + 6} y={y(band.rop) - 5} fontSize="10.5" fill="#0E5E63">ROP {band.rop}</text>
          </>
        )}
        {[0, 60, 120, 180, 240, 300, 365].map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5E636B">{d === 0 ? "Day 0" : d}</text>
        ))}
        <path d={area} fill={`url(#fill-${tone})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
        {shown.map((m) => (
          <g key={m.day} transform={`translate(${x(m.day)},${y(0) - 2})`}>
            <line y1={-10} y2={0} stroke="#A3302A" strokeWidth={1} opacity={0.5} />
            <circle r={3.2} cy={-12} fill="#A3302A" />
          </g>
        ))}
        {recent.map((m) => {
          const age = (t - m.day) / 22;
          return (
            <text key={`f${m.day}`} x={x(m.day)} y={y(0) - 22 - age * 46} textAnchor="middle" fontSize="12" fontWeight={500} fill="#A3302A" opacity={1 - age}>
              +{inrShort(m.premium)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export type { ScenarioId };
