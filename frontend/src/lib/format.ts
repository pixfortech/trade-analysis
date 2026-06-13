// Lightweight formatting helpers (no external deps).
import type { Signal } from "@/types";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

/** Format a number as INR currency, e.g. ₹1,23,456.78 */
export function inr(value: number): string {
  return `₹${inrFormatter.format(value)}`;
}

/** Plain Indian-grouped number, e.g. 1,23,456.78 */
export function num(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

/** Indian-grouped number that keeps up to `max` decimals WITHOUT forcing trailing
 *  zeros — preserves source precision and avoids misleading padding (81,234 /
 *  1,234.5 / 23,418.75 rather than 81,234.00 / 1,234.50). */
export function numFlex(value: number, max = 2): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: max, minimumFractionDigits: 0 }).format(value);
}

/** Market time WITH seconds, e.g. "09:15:23 am". "—" for missing/invalid input. */
export function tsec(value: string | number | Date | null | undefined): string {
  if (value == null) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).toLowerCase();
}

/** Signed percentage, e.g. +0.62% / -1.10% */
export function pct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Signed number, e.g. +18.20 / -4.50 */
export function signed(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

/** Compact large numbers (Indian style), e.g. 12.3L, 4.5Cr */
export function compact(value: number): string {
  if (Math.abs(value) >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`;
  if (Math.abs(value) >= 1e5) return `${(value / 1e5).toFixed(2)}L`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return `${value}`;
}

/** Tailwind text colour class for a signed value. */
export function changeTextClass(value: number): string {
  if (value > 0) return "text-bull";
  if (value < 0) return "text-bear";
  return "text-slate-400";
}

/** Map a signal to Tailwind classes (text / background / border). */
export function signalClasses(signal: Signal): {
  text: string;
  bg: string;
  border: string;
  dot: string;
  label: string;
} {
  switch (signal) {
    case "bullish":
      return {
        text: "text-bull",
        bg: "bg-bull-soft",
        border: "border-bull/30",
        dot: "bg-bull",
        label: "Bullish",
      };
    case "bearish":
      return {
        text: "text-bear",
        bg: "bg-bear-soft",
        border: "border-bear/30",
        dot: "bg-bear",
        label: "Bearish",
      };
    default:
      return {
        text: "text-neutralSignal",
        bg: "bg-neutralSignal-soft",
        border: "border-neutralSignal/30",
        dot: "bg-neutralSignal",
        label: "Neutral",
      };
  }
}
