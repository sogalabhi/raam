import { motion } from "framer-motion";
import { stockStatus, type Policy } from "../lib/policy";
import { STATUS_COLOR, useMotionOff } from "./ui";

/** Horizontal on-hand gauge from 0 to MAX with MIN and ROP ticks. */
export function StockGauge({ onHand, policy, height = 8 }: { onHand: number; policy: Policy; height?: number }) {
  const off = useMotionOff();
  const max = Math.max(policy.MAX, onHand) * 1.04;
  const x = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
  const color = STATUS_COLOR[stockStatus(onHand, policy)];
  return (
    <div>
      <div className="relative rounded-full bg-subtle" style={{ height }}>
        <div className="absolute inset-y-0 rounded-full bg-petrol/10" style={{ left: x(policy.MIN), width: `calc(${x(policy.MAX)} - ${x(policy.MIN)})` }} />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color }}
          initial={{ width: off ? x(onHand) : 0 }}
          animate={{ width: x(onHand) }}
          transition={{ duration: off ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        {[{ v: policy.MIN, l: "MIN" }, { v: policy.ROP, l: "ROP" }].map((t) => (
          <div key={t.l} className="absolute -top-1 -bottom-1 w-px bg-ink/50" style={{ left: x(t.v) }} />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[10.5px] text-muted">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(policy.MIN) }}>MIN {policy.MIN}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(policy.ROP) }}>ROP {policy.ROP}</span>
        <span className="absolute right-0 whitespace-nowrap">MAX {policy.MAX}</span>
      </div>
    </div>
  );
}
