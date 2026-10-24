import { motion } from "framer-motion";
import { useMotionOff } from "./ui";

export function Sparkline({ values, rop, color = "#0E5E63", dot, width = 240, height = 54 }: { values: number[]; rop?: number; color?: string; dot?: string; width?: number; height?: number }) {
  const off = useMotionOff();
  const max = Math.max(...values, rop ?? 0) * 1.1 || 1;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - (v / max) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {rop !== undefined && <line x1={0} x2={width} y1={y(rop)} y2={y(rop)} stroke="#15171A" strokeOpacity={0.35} strokeDasharray="3 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.06} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke"
        initial={{ pathLength: off ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: off ? 0 : 1.4, ease: "easeInOut" }} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.5} fill={dot ?? color} />
    </svg>
  );
}
