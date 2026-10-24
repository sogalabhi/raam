import { animate, motion, useReducedMotion } from "framer-motion";
import {
  BatteryFull, CircleDashed, CircleDot, CloudRain, Cog, Disc3, Droplet, Droplets, Filter, Fuel, Infinity as InfinityIcon,
  Link2, Plane, Snowflake, Syringe, Thermometer, Truck, Wind, Wrench, Zap, Box, Settings2, type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SCENARIOS, SCENARIO_ORDER, type Part, type ScenarioId, type Ved } from "../data/parts";
import type { StockStatus } from "../lib/policy";
import { STATIC } from "../state/store";

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-card border border-hair bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("text-[11.5px] font-medium uppercase tracking-label text-muted", className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-8">
      <div>
        <Label>{eyebrow}</Label>
        <h1 className="mt-1.5 font-serif text-[52px] leading-[1.02] tracking-[-0.01em] text-ink">{title}</h1>
        {sub && <p className="mt-2 max-w-[880px] text-[15.5px] leading-relaxed text-muted">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-3">{right}</div>}
    </div>
  );
}

export function useMotionOff() {
  const reduced = useReducedMotion();
  return STATIC || !!reduced;
}

/** Number that counts up from 0 on mount and eases to new values. */
export function CountUp({ value, format, duration = 1.1 }: { value: number; format: (n: number) => string; duration?: number }) {
  const off = useMotionOff();
  const [shown, setShown] = useState(off ? value : 0);
  const prev = useRef(off ? value : 0);
  useEffect(() => {
    if (off) {
      setShown(value);
      return;
    }
    const c = animate(prev.current, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    prev.current = value;
    return () => c.stop();
  }, [value, off, duration]);
  return <>{format(shown)}</>;
}

export function Ring({ value, size = 76, stroke = 3, color = "#0E5E63", track = "#EFEDE7", marker, children }: {
  value: number; size?: number; stroke?: number; color?: string; track?: string; marker?: number; children?: ReactNode;
}) {
  const off = useMotionOff();
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const mk = marker !== undefined ? Math.max(0, Math.min(1, marker)) : undefined;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: off ? c * (1 - v) : c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: off ? 0 : 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
        {mk !== undefined && (
          <line
            x1={size / 2 + (r - 6) * Math.cos(2 * Math.PI * mk)} y1={size / 2 + (r - 6) * Math.sin(2 * Math.PI * mk)}
            x2={size / 2 + (r + 6) * Math.cos(2 * Math.PI * mk)} y2={size / 2 + (r + 6) * Math.sin(2 * Math.PI * mk)}
            stroke="#B08D57" strokeWidth={2} strokeLinecap="round"
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

const VED_STYLE: Record<Ved, string> = {
  Vital: "bg-ink text-white border-ink",
  Safety: "bg-petrol-soft text-petrol border-petrol/30",
  Essential: "bg-champagne-soft text-[#7d6238] border-champagne/40",
  Comfort: "bg-subtle text-muted border-hair",
};

export function VedBadge({ ved, size = "sm" }: { ved: Ved; size?: "sm" | "lg" }) {
  return (
    <span className={cx(
      "inline-flex items-center rounded-full border font-medium uppercase tracking-[0.1em]",
      size === "lg" ? "px-3 py-1 text-[12px]" : "px-2 py-[2px] text-[10.5px]",
      VED_STYLE[ved],
    )}>
      {ved}
    </span>
  );
}

export function RouteChip({ part }: { part: Part }) {
  const Icon = part.route === "Import" ? Plane : Truck;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-white px-2 py-[2px] text-[11px] text-muted">
      <Icon size={11} strokeWidth={1.8} />
      {part.route === "Import" ? `Import · ${part.origin.split(/[/ ]/)[0]}` : "Domestic"}
    </span>
  );
}

const STATUS: Record<StockStatus, { label: string; cls: string; dot: string }> = {
  healthy: { label: "Healthy", cls: "bg-petrol-soft text-petrol", dot: "bg-petrol" },
  reorder: { label: "At reorder point", cls: "bg-amber-soft text-[#8a5e0b]", dot: "bg-amber" },
  critical: { label: "Below safety stock", cls: "bg-oxblood-soft text-oxblood", dot: "bg-oxblood" },
};

export function StatusPill({ status, short }: { status: StockStatus; short?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-medium", s.cls)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", s.dot)} />
      {short ? (status === "healthy" ? "Healthy" : status === "reorder" ? "Reorder" : "Critical") : s.label}
    </span>
  );
}

export const STATUS_COLOR: Record<StockStatus, string> = { healthy: "#0E5E63", reorder: "#C98A12", critical: "#A3302A" };

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <div className="relative inline-flex rounded-full border border-hair bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative z-10 rounded-full font-medium transition-colors",
              size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]",
              active ? "text-white" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 36 }} />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ScenarioToggle({ value, onChange }: { value: ScenarioId; onChange: (s: ScenarioId) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="!tracking-[0.1em]">Scenario</Label>
      <Segmented
        value={value}
        onChange={onChange}
        options={SCENARIO_ORDER.map((s) => ({
          value: s,
          label: (
            <span className="inline-flex items-center gap-1.5">
              {SCENARIOS[s].label}
              {s === "expected" && <span className={cx("rounded-full px-1.5 text-[9.5px] uppercase tracking-[0.08em]", value === s ? "bg-champagne text-white" : "bg-champagne-soft text-[#7d6238]")}>Headline</span>}
            </span>
          ),
        }))}
      />
    </div>
  );
}

const ICONS: Record<string, LucideIcon> = {
  "Oil Filter": Filter, "Cabin Filter": Wind, "Engine Oil 5L": Droplet, "Wiper Blades": CloudRain, "Fuel Filter": Fuel,
  "Front Brake Pads": Disc3, "Rear Brake Pads": Disc3, "Front Brake Discs": CircleDot, "Spark Plugs": Zap,
  "Coolant 5L": Thermometer, "ATF Fluid 1L": Droplets, "Transmission Kit": Settings2, "AGM Battery": BatteryFull,
  "Drive Belt": InfinityIcon, "Run-Flat Tyre": CircleDashed, "Engine Mount": Box, "Control Arm": Wrench,
  "Diesel Injector": Syringe, "AC Compressor": Snowflake, "Timing Chain": Link2,
};
export const partIcon = (p: Part): LucideIcon => ICONS[p.short] ?? Cog;

/** Silver medallion with the part's icon — stands in for a product photo. */
export function PartMedallion({ part, size = 64 }: { part: Part; size?: number }) {
  const Icon = partIcon(part);
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size, height: size,
        background: "radial-gradient(120% 120% at 30% 20%, #FFFFFF 0%, #E9EAEC 45%, #B9BDC3 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.9), inset 0 -2px 6px rgba(0,0,0,.08), 0 6px 16px rgba(0,0,0,.08)",
      }}
    >
      <div className="absolute inset-[5px] rounded-full border border-white/70" />
      <Icon size={size * 0.42} strokeWidth={1.35} className="text-ink/80" />
    </div>
  );
}

export function Button({ children, variant = "primary", className, ...rest }: {
  children: ReactNode; variant?: "primary" | "ghost" | "danger" | "ink" | "champagne"; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: "bg-petrol text-white hover:bg-petrol-deep shadow-[0_1px_2px_rgba(0,0,0,.08)]",
    ink: "bg-ink text-white hover:bg-black",
    ghost: "border border-hair bg-white text-ink hover:border-[#c9c5bb]",
    danger: "border border-oxblood/30 bg-white text-oxblood hover:bg-oxblood-soft",
    champagne: "bg-champagne text-white hover:brightness-95",
  }[variant];
  return (
    <button
      className={cx("inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40", v, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px] tracking-tight", className)}>{children}</span>;
}

export function Avatar({ name, size = 28, tone = "silver" }: { name: string; size?: number; tone?: "silver" | "ink" | "petrol" }) {
  const init = name.split(/\s+/).map((w) => w[0]).join("").replace(/\./g, "").slice(0, 2);
  const bg = tone === "ink" ? "bg-ink text-white" : tone === "petrol" ? "bg-petrol text-white" : "bg-gradient-to-b from-silver-light to-silver-dark text-ink";
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full font-medium", bg)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {init}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "petrol" | "oxblood" | "ink" | "amber" }) {
  const color = tone === "petrol" ? "text-petrol" : tone === "oxblood" ? "text-oxblood" : tone === "amber" ? "text-amber" : "text-ink";
  return (
    <div>
      <Label>{label}</Label>
      <div className={cx("mt-1 font-serif text-[44px] leading-none", color)}>{value}</div>
      {sub && <div className="mt-1.5 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}
