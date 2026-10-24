import { motion } from "framer-motion";
import { useMemo } from "react";
import { BINS, zoneOf } from "../data/bins";
import { PARTS, type Part } from "../data/parts";
import { stockStatus, type Policy, type StockStatus } from "../lib/policy";
import { useMotionOff } from "./ui";

// Low-camera isometric projection: x runs right-down, y runs left-down, z up.
const S = 27;
const C30 = Math.cos(Math.PI / 6);
const K = 0.42;
const OX = 440;
const OY = 64;
const P = (x: number, y: number, z = 0): [number, number] => [OX + (x - y) * C30 * S, OY + (x + y) * K * S - z * S];
/** SVG transform that lays text flat on the floor, reading along +x. */
const floorText = (x: number, y: number) => { const [sx, sy] = P(x, y); return `matrix(${C30},${K},${-C30},${K},${sx},${sy})`; };
/** SVG transform for text printed on a face that runs along +x. */
const faceText = (x: number, y: number, z: number) => { const [sx, sy] = P(x, y, z); return `matrix(${C30},${K},0,1,${sx},${sy})`; };
const pts = (list: [number, number, number][]) => list.map(([x, y, z]) => P(x, y, z).map((v) => v.toFixed(1)).join(",")).join(" ");

type Slot = { x: number; y: number; w: number; d: number };

/** Bin positions in store coordinates, by bin code. */
const SLOTS: Record<string, Slot> = (() => {
  const out: Record<string, Slot> = {};
  // Servicing racks: three runs, fastest movers on the run nearest the counter.
  const sx = [1.6, 5.1, 8.6];
  const sy = [12.6, 10.0, 7.4];
  for (let i = 0; i < 9; i++) out[`SR-${String(i + 1).padStart(2, "0")}`] = { x: sx[i % 3], y: sy[Math.floor(i / 3)], w: 2.6, d: 1.0 };
  // Priority cage: three runs of four bins.
  const px = [16.2, 18.5, 20.8, 23.1];
  const py = [2.0, 4.6, 7.2];
  for (let i = 0; i < 11; i++) out[`PZ-${String(i + 1).padStart(2, "0")}`] = { x: px[i % 4], y: py[Math.floor(i / 4)], w: 1.8, d: 1.0 };
  return out;
})();

const TINT: Record<StockStatus, { top: string; left: string; right: string; stroke: string }> = {
  healthy: { top: "#2E7A7F", left: "#0E5E63", right: "#0A4649", stroke: "#0A4649" },
  reorder: { top: "#E0A93C", left: "#C98A12", right: "#A3700C", stroke: "#8a5e0b" },
  critical: { top: "#BF4B44", left: "#A3302A", right: "#80241F", stroke: "#6d1e1a" },
};
const NEUTRAL = { top: "#FFFFFF", left: "#F1F1EF", right: "#E4E5E6", stroke: "#B9BDC3" };

function Box({ x, y, z, w, d, h, fill, strokeW = 0.8 }: { x: number; y: number; z: number; w: number; d: number; h: number; fill: typeof NEUTRAL; strokeW?: number }) {
  return (
    <g strokeLinejoin="round" stroke={fill.stroke} strokeWidth={strokeW}>
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={fill.left} />
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={fill.right} />
      <polygon points={pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={fill.top} />
    </g>
  );
}

/** A low open rack under a run of bins. */
function Rack({ x, y, len, depth }: { x: number; y: number; len: number; depth: number }) {
  const z = 0.32;
  return (
    <g>
      <Box x={x} y={y} z={0} w={len} d={depth} h={z} fill={{ top: "#ECEDEF", left: "#DCDEE1", right: "#C9CCD1", stroke: "#B9BDC3" }} strokeW={0.6} />
      {[x + 0.05, x + len - 0.1].map((px) => (
        <line key={px} x1={P(px, y + depth, 0)[0]} y1={P(px, y + depth, 0)[1]} x2={P(px, y + depth, 1.9)[0]} y2={P(px, y + depth, 1.9)[1]} stroke="#B9BDC3" strokeWidth={0.8} />
      ))}
    </g>
  );
}

export type MapBin = { part: Part; onHand: number; policy: Policy };

export function StoreMap({ bins, selected, onSelect }: { bins: MapBin[]; selected?: string; onSelect: (id: string | undefined) => void }) {
  const off = useMotionOff();
  const byCode = useMemo(() => new Map(bins.map((b) => [BINS[b.part.id], b])), [bins]);
  const order = useMemo(() => Object.entries(SLOTS).sort(([, a], [, b]) => a.x + a.y - (b.x + b.y)), []);

  // Cage outline (x 15..25.6, y 0.8..9.2), 2.6 high.
  const cx0 = 15, cx1 = 25.6, cy0 = 0.8, cy1 = 9.0, ch = 2.6;
  const mesh = (a: [number, number], b: [number, number], n: number) => {
    const lines = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const [x1, y1] = P(x, y, 0), [x2, y2] = P(x, y, ch);
      lines.push(<line key={`${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />);
    }
    return lines;
  };
  const wall = (a: [number, number], b: [number, number], front: boolean) => (
    <g>
      <polygon points={pts([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], ch], [a[0], a[1], ch]])} fill="url(#cage-mesh)" opacity={front ? 0.55 : 0.9} stroke="none" />
      <g stroke="#B08D57" strokeWidth={0.45} opacity={front ? 0.45 : 0.7}>{mesh(a, b, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.6))}</g>
      <polyline points={pts([[a[0], a[1], ch], [b[0], b[1], ch]])} fill="none" stroke="#B08D57" strokeWidth={1.4} />
      <polyline points={pts([[a[0], a[1], 0], [b[0], b[1], 0]])} fill="none" stroke="#B08D57" strokeWidth={1} opacity={0.8} />
    </g>
  );

  const labels = bins.filter((b) => b.part.isTest).map((b) => {
    const s = SLOTS[BINS[b.part.id]];
    const status = stockStatus(b.onHand, b.policy);
    return { b, s, status };
  });
  // Hand-placed callout positions (viewBox px) so labels never collide.
  const SPOT: Record<string, [number, number]> = {
    "SR-07": [250, 40], "SR-04": [130, 86], "SR-01": [92, 150], "SR-03": [520, 420], "PZ-01": [866, 74], "PZ-05": [966, 132],
  };

  return (
    <svg viewBox="0 0 1060 560" className="h-full w-full select-none" onClick={() => onSelect(undefined)}>
      <defs>
        <pattern id="cage-mesh" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <path d="M0 0 L0 7" stroke="#B08D57" strokeWidth="0.5" opacity="0.55" />
        </pattern>
        <pattern id="bay-stripes" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#F3F1EC" />
          <path d="M0 0 L0 8" stroke="#E4E1DA" strokeWidth="3" />
        </pattern>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000" floodOpacity="0.06" />
        </filter>
      </defs>

      {/* Floor plate */}
      <g filter="url(#soft)">
        <polygon points={pts([[0, 0, 0], [26, 0, 0], [26, 15.8, 0], [0, 15.8, 0]])} fill="#FFFFFF" stroke="#DAD7CF" strokeWidth={1} />
      </g>
      <g stroke="#EFEDE7" strokeWidth={0.7}>
        {Array.from({ length: 12 }, (_, i) => (i + 1) * 2).map((x) => <polyline key={`gx${x}`} points={pts([[x, 0, 0], [x, 15.8, 0]])} />)}
        {Array.from({ length: 7 }, (_, i) => (i + 1) * 2).map((y) => <polyline key={`gy${y}`} points={pts([[0, y, 0], [26, y, 0]])} />)}
      </g>
      {/* Zone floors */}
      <polygon points={pts([[cx0, cy0, 0], [cx1, cy0, 0], [cx1, cy1, 0], [cx0, cy1, 0]])} fill="#B08D57" opacity={0.07} />
      <polygon points={pts([[0.6, 2.0, 0], [12.4, 2.0, 0], [12.4, 14.4, 0], [0.6, 14.4, 0]])} fill="#0E5E63" opacity={0.05} />
      <text transform={floorText(1.3, 3.4)} fontSize="19" fill="#0E5E63" opacity={0.75} letterSpacing="3" fontWeight={500}>SERVICING RACKS</text>
      <text transform={floorText(cx0 + 1.4, cy1 + 1.7)} fontSize="19" fill="#8a6a3a" opacity={0.85} letterSpacing="3" fontWeight={500}>PRIORITY CAGE</text>
      <text transform={floorText(cx0 + 1.4, cy1 + 2.55)} fontSize="12" fill="#8a6a3a" opacity={0.7} letterSpacing="1">BADGE + PIN · COUNTED WEEKLY</text>
      <text transform={floorText(1.3, 4.25)} fontSize="12" fill="#0E5E63" opacity={0.6} letterSpacing="1">OPEN ACCESS · FASTEST NEAREST THE COUNTER</text>

      {/* Service bays outside the front edge */}
      {Array.from({ length: 6 }, (_, i) => {
        const x = 0.4 + i * 4.3;
        return (
          <g key={i}>
            <polygon points={pts([[x, 16.6, 0], [x + 3.7, 16.6, 0], [x + 3.7, 19.2, 0], [x, 19.2, 0]])} fill="url(#bay-stripes)" stroke="#DAD7CF" strokeDasharray="3 3" />
            <text transform={floorText(x + 0.6, 18.2)} fontSize="15" fontFamily="JetBrains Mono" fill="#8A8F96" letterSpacing="1">BAY {i + 1}</text>
          </g>
        );
      })}

      {/* Back cage walls */}
      {wall([cx0, cy0], [cx1, cy0], false)}
      {wall([cx0, cy0], [cx0, cy1], false)}

      {/* Racks */}
      {[12.6, 10.0, 7.4].map((y) => <Rack key={`sr${y}`} x={1.3} y={y - 0.15} len={10.3} depth={1.3} />)}
      {[2.0, 4.6, 7.2].map((y) => <Rack key={`pz${y}`} x={15.9} y={y - 0.15} len={9.3} depth={1.3} />)}

      {/* Bins, back to front */}
      {order.map(([code, s]) => {
        const b = byCode.get(code);
        if (!b) return null;
        const status = stockStatus(b.onHand, b.policy);
        const fill = b.part.isTest ? TINT[status] : NEUTRAL;
        const sel = selected === b.part.id;
        const h = b.part.isTest ? 1.25 : 1.0;
        return (
          <motion.g
            key={code}
            className="cursor-pointer"
            initial={off ? false : { opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: sel ? -6 : 0 }}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: off ? 0 : 0.15 + (s.x + s.y) * 0.018 }}
            onClick={(e) => { e.stopPropagation(); onSelect(sel ? undefined : b.part.id); }}
          >
            <Box x={s.x} y={s.y} z={0.32} w={s.w} d={s.d} h={h} fill={fill} strokeW={sel ? 1.6 : 0.8} />
            {sel && <polygon points={pts([[s.x, s.y, 0.32 + h], [s.x + s.w, s.y, 0.32 + h], [s.x + s.w, s.y + s.d, 0.32 + h], [s.x, s.y + s.d, 0.32 + h]])} fill="none" stroke="#B08D57" strokeWidth={2} />}
            <text transform={faceText(s.x + 0.22, s.y + s.d, 0.32 + h * 0.62)} fontSize="9" fontFamily="JetBrains Mono" fill={b.part.isTest ? "rgba(255,255,255,.9)" : "#8A8F96"}>{code}</text>
          </motion.g>
        );
      })}

      {/* Front cage walls, gate and sign */}
      {wall([cx0, cy1], [cx1, cy1], true)}
      {wall([cx1, cy0], [cx1, cy1], true)}
      <g>
        <polygon points={pts([[cx0 + 0.6, cy1, 0], [cx0 + 2.6, cy1, 0], [cx0 + 2.6, cy1, 2.2], [cx0 + 0.6, cy1, 2.2]])} fill="#FBF7F0" stroke="#B08D57" strokeWidth={1.2} />
        <circle cx={P(cx0 + 2.3, cy1, 1.1)[0]} cy={P(cx0 + 2.3, cy1, 1.1)[1]} r={2.2} fill="#B08D57" />
      </g>

      {/* Issue counter between racks and bays */}
      <Box x={4.6} y={14.75} z={0} w={7.2} d={0.8} h={0.95} fill={{ top: "#2A2E33", left: "#15171A", right: "#1D2024", stroke: "#15171A" }} />
      <text transform={faceText(5.2, 15.55, 0.36)} fontSize="10.5" fill="#F6F5F1" letterSpacing="2">ISSUE COUNTER</text>


      {/* Callouts for the 6 test parts */}
      {labels.map(({ b, s, status }) => {
        const code = BINS[b.part.id];
        const [ax, ay] = P(s.x + s.w / 2, s.y + s.d / 2, 0.32 + 1.25);
        const [lx, ly] = SPOT[code] ?? [ax, ay - 80];
        const color = TINT[status].left;
        return (
          <motion.g key={`l${code}`} initial={off ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: off ? 0 : 0.9, duration: 0.5 }} className="pointer-events-none">
            <polyline points={`${ax},${ay} ${lx},${ly}`} fill="none" stroke="#15171A" strokeWidth={0.8} opacity={0.4} />
            <circle cx={ax} cy={ay} r={2.4} fill="#15171A" />
            <g transform={`translate(${lx},${ly})`}>
              <rect x={-74} y={-14} width={148} height={30} rx={15} fill="white" stroke="#DAD7CF" />
              <circle cx={-58} cy={1} r={4.5} fill={color} />
              <text x={-47} y={5.5} fontSize="12.5" fill="#15171A" fontFamily="Inter Tight">{b.part.short}</text>
              <text x={66} y={5.5} fontSize="12.5" fill="#5E636B" textAnchor="end" fontFamily="JetBrains Mono">{b.onHand}</text>
            </g>
          </motion.g>
        );
      })}
    </svg>
  );
}

export const ALL_BINS = PARTS.map((p) => ({ id: p.id, code: BINS[p.id], zone: zoneOf(p.id) }));
