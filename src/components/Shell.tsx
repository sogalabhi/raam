import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown, Gauge, LineChart, ListOrdered, RotateCcw, ScanLine, ShieldCheck, SlidersHorizontal, Waypoints,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CENTRE_NAME, FOOTER_NOTE, PRODUCT_NAME } from "../config";
import { USERS } from "../data/people";
import { useStore } from "../state/store";
import { Avatar, cx } from "./ui";

const NAV = [
  { to: "/", label: "Control Tower", icon: Gauge },
  { to: "/counter", label: "Issue Counter", icon: ScanLine },
  { to: "/simulate", label: "Old vs Ours", icon: LineChart },
  { to: "/trail", label: "Part Journey", icon: Waypoints },
  { to: "/planner", label: "Planner", icon: SlidersHorizontal },
  { to: "/reorder", label: "Reorder", icon: ListOrdered },
  { to: "/leakage", label: "Leakage", icon: ShieldCheck },
];

function Mark() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#15171A" />
      <path d="M10 22.5V9.5h6.5a4 4 0 0 1 0 8H10" fill="none" stroke="#F6F5F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="22.5" r="1.9" fill="#B08D57" />
    </svg>
  );
}

function Rail() {
  return (
    <nav className="fixed inset-y-0 left-0 z-30 flex w-[92px] flex-col items-center border-r border-hair bg-white/80 py-5 backdrop-blur">
      <Mark />
      <div className="mt-8 flex flex-1 flex-col gap-1.5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cx(
                "group relative flex w-[76px] flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center transition-colors",
                isActive ? "text-petrol" : "text-muted hover:text-ink",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="rail-active" className="absolute inset-0 -z-10 rounded-xl bg-petrol-soft/70" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                )}
                {isActive && <span className="absolute left-[-8px] top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-champagne" />}
                <Icon size={20} strokeWidth={1.6} />
                <span className="text-[10.5px] font-medium leading-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function UserMenu() {
  const { user, setUser } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-full border border-hair bg-white py-1 pl-1 pr-3 hover:border-[#c9c5bb]">
        <Avatar name={user.name} size={30} tone={user.role === "Service Manager" ? "ink" : "silver"} />
        <span className="text-left leading-tight">
          <span className="block text-[13px] font-medium text-ink">{user.name}</span>
          <span className="block text-[11px] text-muted">{user.role}</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-2xl border border-hair bg-white/95 p-1.5 shadow-float backdrop-blur"
          >
            <div className="px-3 pb-1.5 pt-2 text-[11px] uppercase tracking-label text-muted">Switch user (demo)</div>
            {USERS.map((u) => (
              <button
                key={u.name}
                onClick={() => { setUser(u.name); setOpen(false); }}
                className={cx("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-subtle", u.name === user.name && "bg-subtle")}
              >
                <Avatar name={u.name} size={26} tone={u.role === "Service Manager" ? "ink" : "silver"} />
                <span className="leading-tight">
                  <span className="block text-[13px] text-ink">{u.name}</span>
                  <span className="block text-[11px] text-muted">{u.role}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopBar() {
  const { now, reset } = useStore();
  const date = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-hair bg-paper/85 px-10 backdrop-blur">
      <div className="flex items-baseline gap-3">
        <span className="font-serif text-[24px] leading-none text-ink">{PRODUCT_NAME}</span>
        <span className="text-hair">·</span>
        <span className="text-[14px] text-ink">{CENTRE_NAME}</span>
        <span className="text-[13px] text-muted">(illustrative)</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[13px] text-muted">{date}</span>
        <span className="rounded-full border border-champagne/40 bg-champagne-soft px-2.5 py-[3px] text-[11px] font-medium uppercase tracking-[0.1em] text-[#7d6238]">Demo data</span>
        <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] text-muted hover:bg-subtle hover:text-ink">
          <RotateCcw size={14} /> Reset demo
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Rail />
      <div className="pl-[92px]">
        <TopBar />
        <main key={loc.pathname} className="px-10 pb-6 pt-8">{children}</main>
        <footer className="px-10 pb-6 text-[11.5px] text-muted">{FOOTER_NOTE}</footer>
      </div>
    </div>
  );
}
