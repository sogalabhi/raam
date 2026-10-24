import { ArrowDownToLine, ClipboardCheck, Link2, PackageCheck, Receipt, ScanLine, ShoppingCart, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { partById } from "../data/parts";
import { time } from "../lib/format";
import type { LedgerEvent } from "../lib/ledger";

export const EVENT_ICON: Record<LedgerEvent["type"], LucideIcon> = {
  RECEIVED: ArrowDownToLine, SHELVED: PackageCheck, ISSUED: ScanLine, ISSUED_UNLINKED: TriangleAlert, LINKED: Link2,
  RETURNED: Undo2, BILLED: Receipt, COUNTED: ClipboardCheck, ORDERED: ShoppingCart,
};

const B = ({ children }: { children: ReactNode }) => <span className="font-medium text-ink">{children}</span>;
const M = ({ children }: { children: ReactNode }) => <span className="whitespace-nowrap font-mono text-[12px] text-ink">{children}</span>;

export function eventText(e: LedgerEvent): ReactNode {
  const p = partById(e.partId).short;
  const q = `${e.qty}×`;
  switch (e.type) {
    case "ISSUED":
      return <><B>{e.actor}</B> issued {q} <B>{p}</B> to <B>{e.technician}</B> against <M>{e.jobCardId}</M></>;
    case "ISSUED_UNLINKED":
      return <>Emergency issue: {q} <B>{p}</B> to <B>{e.technician}</B> · approved by {e.approver}</>;
    case "LINKED":
      return <><B>{e.actor}</B> linked {q} {p} to <M>{e.jobCardId}</M></>;
    case "RETURNED":
      return <><B>{e.technician ?? e.actor}</B> returned {q} <B>{p}</B>{e.reason ? ` · ${e.reason}` : ""}</>;
    case "RECEIVED":
      return <><B>{e.actor}</B> received {q} <B>{p}</B> <span className="text-muted">({e.note})</span></>;
    case "SHELVED":
      return <><B>{e.actor}</B> shelved {q} {p} in <M>{e.bin}</M></>;
    case "BILLED":
      return <>{q} {p} billed on <M>{e.jobCardId}</M></>;
    case "COUNTED":
      return <><B>{e.actor}</B> counted {p}: shelf {e.countedQty} vs system {e.systemQty}</>;
    case "ORDERED":
      return <><B>{e.actor}</B> raised <M>{e.note}</M> for {q} {p}</>;
  }
}

export function FeedLine({ e, fresh }: { e: LedgerEvent; fresh?: boolean }) {
  const Icon = EVENT_ICON[e.type];
  const warn = e.type === "ISSUED_UNLINKED";
  return (
    <div className={`flex gap-3 rounded-xl px-3 py-2.5 ${fresh ? "bg-petrol-soft/70" : ""}`}>
      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border ${warn ? "border-amber/40 bg-amber-soft text-[#8a5e0b]" : "border-hair bg-white text-muted"}`}>
        <Icon size={13} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 text-[13px] leading-snug text-muted">
        <span className="mr-1.5 font-mono text-[12px] text-ink">{time(e.ts)}</span>
        {eventText(e)}
      </div>
    </div>
  );
}
