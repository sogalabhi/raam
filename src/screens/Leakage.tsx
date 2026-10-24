import { useState } from "react";
import { Button, Card, Label, Mono, PageHeader, cx } from "../components/ui";
import { RECOUNT_THRESHOLD } from "../config";
import { BINS, zoneOf } from "../data/bins";
import { PARTS, partById } from "../data/parts";
import { MANAGER } from "../data/people";
import { dateTime, inr, inrShort } from "../lib/format";
import { closeBlockers } from "../lib/ledger";
import { useStore } from "../state/store";

const KIND = { unlinked: "Unlinked issue", "not-billed": "Issued, not billed", count: "Count variance" } as const;

export function Leakage() {
  const { exceptions, chains, events, now } = useStore();
  const total = exceptions.reduce((s, e) => s + e.value, 0);
  const blockedJC = exceptions.find((e) => e.kind === "not-billed")?.jobCardId;

  // Heatmap: mismatch % by part x week (last 12 weeks).
  const counted = events.filter((e) => e.type === "COUNTED");
  const heatParts = PARTS.filter((p) => counted.some((e) => e.partId === p.id));
  const cell = (partId: string, w: number) => {
    const hi = now - w * 7 * 86400000, lo = hi - 7 * 86400000;
    const c = counted.find((e) => e.partId === partId && +new Date(e.ts) > lo && +new Date(e.ts) <= hi);
    if (!c) return null;
    return Math.abs((c.countedQty ?? 0) - (c.systemQty ?? 0)) / Math.max(1, c.systemQty ?? 1);
  };

  return (
    <div>
      <PageHeader eyebrow="Reconciliation & leakage" title={<>{inrShort(total)} is open on the register today.</>}
        sub="Every exception is named against a person. A job card can't close while any issued part is neither billed nor returned." />
      <div className="grid grid-cols-[1fr_420px] gap-6">
        <Card className="p-6">
          <Label>Leakage register · {exceptions.length} open</Label>
          <table className="mt-3 w-full text-[13.5px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-label text-muted">
              <th className="py-2">Type</th><th>Part</th><th>Qty</th><th className="text-right">Value</th><th className="pl-6">Person · approver</th><th>Job card</th><th>When</th></tr></thead>
            <tbody>{exceptions.map((e) => (
              <tr key={e.id} className="border-t border-hair">
                <td className="py-3"><span className={cx("rounded-full px-2 py-[2px] text-[11.5px]", e.kind === "count" ? "bg-amber-soft text-[#8a5e0b]" : "bg-oxblood-soft text-oxblood")}>{KIND[e.kind]}</span></td>
                <td>{partById(e.partId).short}<div className="text-[11.5px] text-muted">{e.note}</div></td>
                <td>{e.qty}</td>
                <td className="text-right font-serif text-[22px]">{inr(e.value)}</td>
                <td className="pl-6">{e.person}{e.approver ? ` · ${e.approver}` : ""}</td>
                <td><Mono>{e.jobCardId ?? "—"}</Mono></td>
                <td className="text-muted">{dateTime(e.ts)}</td>
              </tr>))}</tbody>
          </table>
          {blockedJC && <CloseRule id={blockedJC} blockers={closeBlockers(blockedJC, chains).length} />}
        </Card>
        <BlindCount />
      </div>
      <Card className="mt-6 p-6">
        <Label>Count mismatch by part · last 12 weeks (Priority weekly, Servicing every 4 weeks)</Label>
        <div className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: "170px repeat(12, 1fr)" }}>
          {heatParts.map((p) => [
            <div key={p.id} className="truncate text-[12px] text-muted">{p.short}</div>,
            ...Array.from({ length: 12 }, (_, i) => {
              const v = cell(p.id, 11 - i);
              return <div key={i} className="h-4 rounded-[3px]" title={v === null ? "not counted" : `${(v * 100).toFixed(1)}%`}
                style={{ background: v === null ? "#EFEDE7" : v === 0 ? "#FFFFFF" : `rgba(163,48,42,${Math.min(1, 0.25 + v * 60)})`, border: "1px solid #DAD7CF" }} />;
            }),
          ])}
        </div>
      </Card>
    </div>
  );
}

function CloseRule({ id, blockers }: { id: string; blockers: number }) {
  const { closeJobCard } = useStore();
  const [tried, setTried] = useState(false);
  return (
    <div className="mt-5 flex items-center justify-between rounded-2xl border border-hair bg-[#FBFAF7] px-5 py-4">
      <div className="text-[13.5px]">Close job card <Mono>{id}</Mono>
        {tried && <div className="text-oxblood">Blocked: {blockers} issued part not billed or returned.</div>}</div>
      <Button variant="ghost" onClick={() => { closeJobCard(id); setTried(true); }}>Close job card</Button>
    </div>
  );
}

function BlindCount() {
  const { stock, count } = useStore();
  const cage = PARTS.filter((p) => zoneOf(p.id) === "PRIORITY");
  const [pid, setPid] = useState(cage[0].id);
  const [val, setVal] = useState("");
  const [shown, setShown] = useState<{ sys: number; got: number } | null>(null);
  const zone = zoneOf(pid);
  const diff = shown ? shown.got - shown.sys : 0;
  const recount = shown && Math.abs(diff) / Math.max(1, shown.sys) > RECOUNT_THRESHOLD[zone];
  return (
    <Card className="p-6">
      <Label>Blind cycle count</Label>
      <p className="mt-1 text-[13px] text-muted">Count the shelf without seeing the system number.</p>
      <select value={pid} onChange={(e) => { setPid(e.target.value); setShown(null); setVal(""); }} className="mt-4 w-full rounded-xl border border-hair bg-white px-3 py-2">
        {PARTS.map((p) => <option key={p.id} value={p.id}>{p.short} · {BINS[p.id]}</option>)}
      </select>
      <input value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))} placeholder="Shelf quantity" className="mt-3 w-full rounded-xl border border-hair bg-white px-3 py-3 font-serif text-[28px] outline-none" />
      <Button className="mt-3 w-full" disabled={!val || !!shown} onClick={() => { const sys = stock[pid]; setShown({ sys, got: Number(val) }); count(pid, Number(val), undefined); }}>Reveal</Button>
      {shown && (
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div><Label>Shelf</Label><div className="font-serif text-[36px]">{shown.got}</div></div>
          <div><Label>System</Label><div className="font-serif text-[36px]">{shown.sys}</div></div>
          <div><Label>Diff</Label><div className={cx("font-serif text-[36px]", diff ? "text-oxblood" : "text-petrol")}>{diff > 0 ? "+" : ""}{diff}</div></div>
          <div className="col-span-3 text-[13px]">{diff === 0 ? "Matches. Logged." : recount ? `Second-person recount required (${MANAGER}).` : "Within tolerance. Variance logged."}</div>
        </div>
      )}
    </Card>
  );
}
