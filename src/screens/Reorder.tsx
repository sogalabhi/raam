import { LayoutGroup, motion } from "framer-motion";
import { Check, Plane, ShoppingCart } from "lucide-react";
import { useMemo } from "react";
import { Button, Card, Label, PageHeader, PartMedallion, ScenarioToggle, VedBadge, cx } from "../components/ui";
import { ASSUMPTIONS, PARTS, partById } from "../data/parts";
import { dateShort, inrShort } from "../lib/format";
import { rankPriority, type PriorityRow } from "../lib/priority";
import { useStore } from "../state/store";

const SEG = [
  { k: "criticality", label: "Criticality", color: "#0A4649" },
  { k: "urgency", label: "Urgency", color: "#0E5E63" },
  { k: "exposure", label: "Money at risk", color: "#B08D57" },
  { k: "recovery", label: "Recovery time", color: "#D9C3A0" },
] as const;

export function Reorder() {
  const { scenario, setScenario, stock, policy, onOrder, raisePO, events, now } = useStore();
  const queue = useMemo(() => PARTS.filter((p) => stock[p.id] <= policy(p.id).ROP), [stock, policy]);
  const rows = useMemo(() => rankPriority(queue.map((part) => ({ part, stockOnHand: stock[part.id] }))), [queue, stock]);
  const orderedToday = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return new Map(events.filter((e) => e.type === "ORDERED" && new Date(e.ts).getTime() >= start.getTime()).map((e) => [e.partId, e]));
  }, [events, now]);
  const sorted = [...rows].sort((a, b) => Number(orderedToday.has(a.part.id)) - Number(orderedToday.has(b.part.id)) || a.rank - b.rank);
  const top = rows.find((r) => r.rank === 1);
  const maxScore = 10;
  const W = ASSUMPTIONS.priorityWeights;

  return (
    <div>
      <PageHeader
        eyebrow="Today's reorder queue · Algorithm 2"
        title="Which order to place first."
        sub={<>Every part at or below its reorder point, ranked by criticality ({W.criticality * 100}%), urgency ({W.urgency * 100}%), money at risk ({W.financialExposure * 100}%) and recovery time ({W.recoveryRisk * 100}%).</>}
        right={<ScenarioToggle value={scenario} onChange={setScenario} />}
      />

      <div className="grid grid-cols-[1fr_400px] gap-6">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <Label>{rows.length} parts need ordering</Label>
            <div className="flex items-center gap-4 text-[12px] text-muted">
              {SEG.map((s) => <span key={s.k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
            </div>
          </div>
          <LayoutGroup>
            <div className="space-y-2.5">
              {sorted.map((r) => {
                const po = orderedToday.get(r.part.id) ?? (onOrder[r.part.id] ? { eta: onOrder[r.part.id].eta } : undefined);
                return (
                  <motion.div layout key={r.part.id} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
                    <QueueRow r={r} maxScore={maxScore} ordered={orderedToday.has(r.part.id)} eta={po?.eta} onRaise={(expedite) => {
                      const pol = policy(r.part.id);
                      const qty = Math.max(pol.EOQ, pol.MAX - stock[r.part.id] - (onOrder[r.part.id]?.qty ?? 0));
                      raisePO(r.part.id, qty, expedite);
                    }} />
                  </motion.div>
                );
              })}
            </div>
          </LayoutGroup>
        </Card>

        {top && <WhyFirst r={top} />}
      </div>
    </div>
  );
}

function QueueRow({ r, maxScore, ordered, eta, onRaise }: { r: PriorityRow; maxScore: number; ordered: boolean; eta?: string; onRaise: (expedite: boolean) => void }) {
  const { policy } = useStore();
  const pol = policy(r.part.id);
  const runsOut = r.daysLeft < r.part.leadTimeNormal;
  return (
    <div className={cx("grid grid-cols-[52px_250px_1fr_80px_210px] items-center gap-4 rounded-2xl border px-4 py-3 transition", ordered ? "border-hair bg-subtle/40 opacity-70" : "border-hair bg-white")}>
      <span className="font-serif text-[40px] leading-none text-ink/80">{r.rank}</span>
      <div className="flex min-w-0 items-center gap-3">
        <PartMedallion part={r.part} size={40} />
        <div className="min-w-0">
          <div className="truncate text-[15px] text-ink">{r.part.short}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted"><VedBadge ved={r.part.ved} /><span>{r.stockOnHand} on hand · ROP {pol.ROP}</span></div>
        </div>
      </div>
      <div>
        <div className="flex h-7 overflow-hidden rounded-full bg-subtle">
          {SEG.map((s, i) => (
            <motion.div key={s.k} className="h-full" style={{ background: s.color }}
              initial={{ width: 0 }} animate={{ width: `${(r.parts[s.k] / maxScore) * 100}%` }}
              transition={{ duration: 0.8, delay: 0.1 + i * 0.12, ease: [0.16, 1, 0.3, 1] }} />
          ))}
        </div>
        <div className="mt-1 text-[11.5px] text-muted">
          {r.daysLeft < 1 ? "Less than a day of stock" : `${r.daysLeft.toFixed(1)} days of stock`} · normal delivery {r.part.leadTimeNormal} days
          {runsOut && <span className="text-[#8a5e0b]"> · runs out before it arrives</span>}
        </div>
      </div>
      <span className="text-right font-serif text-[34px] leading-none">{r.score.toFixed(2)}</span>
      <div className="flex justify-end gap-2">
        {ordered ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-petrol-soft px-3 py-1.5 text-[12.5px] text-petrol"><Check size={14} /> PO raised · arrives {eta ? dateShort(eta) : ""}</span>
        ) : (
          <>
            {runsOut && <Button variant="ghost" className="px-3 py-1.5 text-[12.5px]" onClick={() => onRaise(true)} title={`Urgent freight: ${r.part.leadTimeUrgent} days at +${Math.round(r.part.emergencyPremium * 100)}%`}><Plane size={13} /> {r.part.leadTimeUrgent}d</Button>}
            <Button className="px-3.5 py-1.5 text-[12.5px]" onClick={() => onRaise(false)}><ShoppingCart size={13} /> Raise PO</Button>
          </>
        )}
      </div>
    </div>
  );
}

function WhyFirst({ r }: { r: PriorityRow }) {
  const W = ASSUMPTIONS.priorityWeights;
  const items = [
    { label: "Criticality", why: `${r.part.ved} part — VED weight ${r.criticality}/10`, w: W.criticality, raw: r.criticality, c: r.parts.criticality, color: SEG[0].color },
    { label: "Urgency", why: `${r.daysLeft.toFixed(1)} days left vs ${r.part.leadTimeNormal}-day lead time`, w: W.urgency, raw: r.urgency, c: r.parts.urgency, color: SEG[1].color },
    { label: "Money at risk", why: `${inrShort(r.part.unitCost * r.part.emergencyPremium)} premium per emergency unit`, w: W.financialExposure, raw: r.exposure, c: r.parts.exposure, color: SEG[2].color },
    { label: "Recovery time", why: `${r.part.leadTimeUrgent} days even by air`, w: W.recoveryRisk, raw: r.recovery, c: r.parts.recovery, color: SEG[3].color },
  ];
  return (
    <Card className="p-6">
      <Label>Why {partById(r.part.id).short} is first</Label>
      <div className="mt-2 font-serif text-[64px] leading-none">{r.score.toFixed(2)}<span className="text-[22px] text-muted"> / 10</span></div>
      <div className="mt-5 space-y-4">
        {items.map((it) => (
          <div key={it.label}>
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-2 text-[14px] text-ink"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />{it.label}</span>
              <span className="font-mono text-[12px] text-muted">{it.w.toFixed(2)} × {it.raw.toFixed(1)} = <span className="text-ink">{it.c.toFixed(2)}</span></span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">{it.why}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl bg-subtle/70 px-4 py-3 text-[12.5px] leading-relaxed text-muted">
        Scores are compared within today's queue, so money at risk and recovery time are scaled 0–10 against the other parts waiting.
      </div>
    </Card>
  );
}
