"use client";

import { useId } from "react";

/** Themed select that matches the app (replaces inconsistent native styling). */
export function ThemedSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="w-full appearance-none rounded-lg border border-white/10 bg-base-800/70 py-2.5 pl-3 pr-9 text-sm font-medium capitalize text-slate-100 transition-colors hover:border-white/20 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-base-850 capitalize text-slate-100">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export type InstrumentSegment = "all" | "equity" | "indices" | "futures" | "options";

const SEGMENTS: { value: InstrumentSegment; label: string }[] = [
  { value: "all", label: "All" },
  { value: "equity", label: "Equity" },
  { value: "indices", label: "Index" },
  { value: "futures", label: "Futures" },
  { value: "options", label: "Options" },
];

/** Segmented control for instrument type (Equity / Index / Futures / Options). */
export function InstrumentTypeSelector({
  value,
  onChange,
}: {
  value: InstrumentSegment;
  onChange: (v: InstrumentSegment) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-white/10 bg-base-800/60 p-0.5">
      {SEGMENTS.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === s.value ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** Hover/tap info tooltip ("What is this?"). Static-export safe (pure CSS/JS). */
export function InfoTooltip({ label = "What is this?", children }: { label?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        aria-describedby={id}
        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-base-800/60 px-2 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-200"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
        </svg>
        {label}
      </button>
      <span
        id={id}
        role="tooltip"
        className="invisible absolute left-0 top-full z-40 mt-1.5 w-72 max-w-[80vw] rounded-lg border border-white/10 bg-base-900 p-3 text-xs leading-relaxed text-slate-300 opacity-0 shadow-card transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
