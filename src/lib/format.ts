// Indian number formatting and small display helpers.

const group = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const num = (n: number) => group.format(Math.round(n));

/** ₹12,34,567 */
export const inr = (n: number) => `₹${group.format(Math.round(n))}`;

/** ₹66.4 L / ₹1.22 Cr / ₹48,500 */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} L`;
  return `${sign}₹${group.format(Math.round(a))}`;
}

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export const time = (iso: string | number) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const dateShort = (iso: string | number) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const dateTime = (iso: string | number) => `${dateShort(iso)} · ${time(iso)}`;

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
