"use client";

// Terminal design-system primitives — faithful recreations of the Claude Design
// trading components (ActionPill, Icon, Switch), built on the CSS-variable token
// system in globals.css. Presentational only.

import type { CSSProperties, ReactNode } from "react";

export type DsAction = "enter" | "wait" | "hold" | "exit" | "avoid" | "none";

/* --------------------------------- icons --------------------------------- */
// Minimal inline lucide-style icon set (no runtime icon dependency — keeps the
// static export self-contained).
const PATHS: Record<string, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  gauge: <><path d="M12 13l4-4" /><path d="M3.3 18a10 10 0 1 1 17.4 0" /></>,
  bot: <><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="8.5" cy="16" r="1" /><circle cx="15.5" cy="16" r="1" /><path d="M12 7v4" /><circle cx="12" cy="5" r="2" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>,
  "log-in": <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></>,
  "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  hold: <><rect x="7" y="4" width="3" height="16" rx="1" /><rect x="14" y="4" width="3" height="16" rx="1" /></>,
  trending: <><path d="M22 7l-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4M12 16h.01" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-up": <path d="M18 15l-6-6-6 6" />,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  "grip-vertical": <><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
};

export function Icon({ n, size = 16, color, style }: { n: string; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color ?? "currentColor"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0, ...style }} aria-hidden>
      {PATHS[n] ?? null}
    </svg>
  );
}

/* ------------------------------- ActionPill ------------------------------ */
const ACTIONS: Record<DsAction, { label: string; color: string; soft: string; border: string; icon: string }> = {
  enter: { label: "ENTER", color: "var(--action-enter)", soft: "var(--action-enter-soft)", border: "var(--action-enter-border)", icon: "trending" },
  wait: { label: "WAIT", color: "var(--action-wait)", soft: "var(--action-wait-soft)", border: "var(--action-wait-border)", icon: "clock" },
  hold: { label: "HOLD", color: "var(--action-enter)", soft: "var(--action-enter-soft)", border: "var(--action-enter-border)", icon: "hold" },
  exit: { label: "EXIT", color: "var(--action-exit)", soft: "var(--action-exit-soft)", border: "var(--action-exit-border)", icon: "log-out" },
  avoid: { label: "AVOID", color: "var(--action-avoid)", soft: "var(--action-avoid-soft)", border: "var(--action-avoid-border)", icon: "shield" },
  none: { label: "NO SETUP", color: "var(--action-none)", soft: "var(--action-none-soft)", border: "var(--action-none-border)", icon: "minus" },
};

/** The decisive state label — the single most important affordance in the cockpit. */
export function ActionPill({ action = "none", size = "md", variant = "solid", showIcon = true, label }: { action?: DsAction; size?: "sm" | "md" | "lg"; variant?: "solid" | "soft"; showIcon?: boolean; label?: string }) {
  const a = ACTIONS[action] ?? ACTIONS.none;
  const s = ({ sm: { h: 24, px: 10, f: 12, ic: 13 }, md: { h: 32, px: 14, f: 13, ic: 16 }, lg: { h: 44, px: 20, f: 17, ic: 20 } } as const)[size];
  const solid = variant === "solid";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: s.h, padding: `0 ${s.px}px`, borderRadius: "var(--radius-md)", fontFamily: "var(--font-ui)", fontSize: s.f, fontWeight: 800, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", background: solid ? a.color : a.soft, color: solid ? "#fff" : a.color, border: solid ? "1px solid transparent" : `1px solid ${a.border}`, whiteSpace: "nowrap" }}>
      {showIcon && <Icon n={a.icon} size={s.ic} />}
      {label ?? a.label}
    </span>
  );
}

/* --------------------------------- Switch -------------------------------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      style={{ position: "relative", width: 38, height: 22, flexShrink: 0, borderRadius: 999, border: "none", cursor: "pointer", padding: 0, background: checked ? "var(--status-live)" : "var(--ink-4)", transition: "background var(--dur-fast) var(--ease-out)" }}>
      <span style={{ position: "absolute", top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.3)", transition: "left var(--dur-fast) var(--ease-out)" }} />
    </button>
  );
}

/** Uppercase tracked micro-label. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span className="eyebrow" style={style}>{children}</span>;
}

/* --------------------------------- DsCard -------------------------------- */
type Pad = "none" | "sm" | "md" | "lg";
const PADS: Record<Pad, number | string> = { none: 0, sm: "var(--space-3)", md: "var(--space-5)", lg: "var(--space-6)" };

/** The base design surface — eyebrow + title header, optional action accent. */
export function DsCard({ children, title, eyebrow, action, headerRight, padding = "md", accent = false, elevated = false, style, bodyStyle }: {
  children: ReactNode; title?: string; eyebrow?: string; action?: DsAction; headerRight?: ReactNode; padding?: Pad; accent?: boolean; elevated?: boolean; style?: CSSProperties; bodyStyle?: CSSProperties;
}) {
  const pad = PADS[padding];
  const accentColor = action ? ACTIONS[action]?.color ?? "var(--border-2)" : "var(--border-2)";
  return (
    <section style={{ position: "relative", background: "var(--surface-card)", border: "1px solid var(--border-1)", borderRadius: "var(--radius-lg)", boxShadow: elevated ? "var(--shadow-md)" : "var(--shadow-sm)", overflow: "hidden", ...style }}>
      {accent && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accentColor }} />}
      {(title || eyebrow || headerRight) && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: `var(--space-4) ${pad === 0 ? "var(--space-5)" : pad}`, borderBottom: "1px solid var(--border-1)" }}>
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 3 }}>{eyebrow}</div>}
            {title && <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--ink-1)" }}>{title}</h3>}
          </div>
          {headerRight && <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>{headerRight}</div>}
        </header>
      )}
      <div style={{ padding: pad, ...bodyStyle }}>{children}</div>
    </section>
  );
}

/* --------------------------------- Badge --------------------------------- */
type BadgeTone = "neutral" | "enter" | "wait" | "exit" | "avoid" | "brand";
const BADGE: Record<BadgeTone, [string, string, string]> = {
  neutral: ["var(--action-none-soft)", "var(--action-none-strong)", "var(--action-none-border)"],
  enter: ["var(--action-enter-soft)", "var(--action-enter-strong)", "var(--action-enter-border)"],
  wait: ["var(--action-wait-soft)", "var(--action-wait-strong)", "var(--action-wait-border)"],
  exit: ["var(--action-exit-soft)", "var(--action-exit-strong)", "var(--action-exit-border)"],
  avoid: ["var(--action-avoid-soft)", "var(--action-avoid-strong)", "var(--action-avoid-border)"],
  brand: ["var(--brand-50)", "var(--brand-700)", "var(--brand-100)"],
};
const DOT: Record<BadgeTone, string> = { neutral: "var(--action-none)", enter: "var(--action-enter)", wait: "var(--action-wait)", exit: "var(--action-exit)", avoid: "var(--action-avoid)", brand: "var(--brand-500)" };

export function DsBadge({ children, tone = "neutral", size = "md", dot = false }: { children: ReactNode; tone?: BadgeTone; size?: "sm" | "md"; dot?: boolean }) {
  const [bg, fg, bd] = BADGE[tone];
  const s = size === "sm" ? { h: 18, px: 7, f: 11 } : { h: 22, px: 9, f: 12 };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: s.h, padding: `0 ${s.px}px`, borderRadius: "var(--radius-pill)", fontFamily: "var(--font-ui)", fontSize: s.f, fontWeight: 700, letterSpacing: "0.02em", whiteSpace: "nowrap", background: bg, color: fg, border: `1px solid ${bd}` }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: DOT[tone] }} />}
      {children}
    </span>
  );
}

/* -------------------------------- PriceStat ------------------------------ */
type Tone = "default" | "enter" | "exit" | "wait" | "avoid" | "up" | "down";
const TONE_COLOR: Record<Tone, string> = { default: "var(--ink-1)", enter: "var(--action-enter)", exit: "var(--action-exit)", wait: "var(--action-wait)", avoid: "var(--action-avoid)", up: "var(--price-up)", down: "var(--price-down)" };

/** Labelled tabular number — CMP / entry / SL / target. */
export function PriceStat({ label, value, prefix = "₹", delta, deltaDir, tone = "default", size = "md", align = "left" }: {
  label: string; value: string | number; prefix?: string; delta?: string; deltaDir?: "up" | "down"; tone?: Tone; size?: "sm" | "md" | "lg"; align?: "left" | "right" | "center";
}) {
  const sz = ({ sm: { v: "var(--text-lg)", l: "var(--text-2xs)" }, md: { v: "var(--text-2xl)", l: "var(--text-xs)" }, lg: { v: "var(--text-4xl)", l: "var(--text-xs)" } } as const)[size];
  const dir = deltaDir ?? (typeof delta === "string" && (delta.trim().startsWith("-") || delta.trim().startsWith("−")) ? "down" : "up");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: align, alignItems: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start" }}>
      <span className="eyebrow" style={{ fontSize: sz.l }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
        <span className="num" style={{ fontSize: sz.v, fontWeight: 700, color: TONE_COLOR[tone], letterSpacing: "-0.01em", lineHeight: 1 }}>
          {prefix && <span style={{ opacity: 0.55, fontWeight: 500, marginRight: 1 }}>{prefix}</span>}{value}
        </span>
        {delta != null && (
          <span className="num" style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "var(--text-sm)", fontWeight: 700, color: dir === "down" ? "var(--price-down)" : "var(--price-up)" }}>
            <span style={{ fontSize: "0.85em" }}>{dir === "down" ? "▼" : "▲"}</span>{delta}
          </span>
        )}
      </span>
    </div>
  );
}

/* -------------------------------- LevelRow ------------------------------- */
type LevelKind = "entry" | "stop" | "target" | "trail" | "neutral";
const LEVEL: Record<LevelKind, string> = { entry: "var(--action-enter)", stop: "var(--action-exit)", target: "var(--action-enter)", trail: "var(--action-wait)", neutral: "var(--ink-3)" };

/** One row in the locked trade-plan ladder. */
export function LevelRow({ kind = "neutral", label, value, note, locked = false, last = false }: { kind?: LevelKind; label: string; value: string; note?: string; locked?: boolean; last?: boolean }) {
  const c = LEVEL[kind];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: last ? "none" : "1px solid var(--border-1)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: kind === "neutral" ? "var(--ink-4)" : c, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--ink-2)", display: "inline-flex", alignItems: "center", gap: 7 }}>
        {label}
        {locked && <Icon n="lock" size={12} color="var(--ink-4)" />}
      </span>
      {note && <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--ink-3)" }}>{note}</span>}
      <span className="num" style={{ fontSize: "var(--text-md)", fontWeight: 700, color: c, minWidth: 92, textAlign: "right" }}>{value}</span>
    </div>
  );
}

/* ----------------------------- ConfidenceMeter --------------------------- */
/** Horizontal confidence bar with the approval gate marked. */
export function ConfidenceMeter({ value = 0, gate = 75, label = "Current approval", showLabel = true }: { value?: number; gate?: number; label?: string; showLabel?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= gate ? "var(--confidence-high)" : v >= 50 ? "var(--confidence-mid)" : "var(--confidence-low)";
  const approved = v >= gate;
  return (
    <div>
      {showLabel && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
          <span className="eyebrow">{label}</span>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            <span className="num" style={{ fontSize: "var(--text-lg)", fontWeight: 700, color }}>{v}%</span>
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color }}>{approved ? "Approved" : v >= 50 ? "Caution" : "Weak"}</span>
          </span>
        </div>
      )}
      <div style={{ position: "relative", height: 8, borderRadius: "var(--radius-pill)", background: "var(--surface-sunken)" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "var(--radius-pill)", overflow: "hidden" }}>
          <div style={{ width: `${v}%`, height: "100%", background: color, borderRadius: "var(--radius-pill)", transition: "width var(--dur-slow) var(--ease-out)" }} />
        </div>
        <span style={{ position: "absolute", left: `${gate}%`, top: -3, bottom: -3, width: 2, background: "var(--ink-1)", opacity: 0.55, borderRadius: 1 }} title={`${gate}% approval gate`} />
      </div>
    </div>
  );
}

/* ---------------------------------- Field -------------------------------- */
/** Compact label/value field for the risk planner grid. */
export function Field({ label, value, tone }: { label: string; value: string; tone?: "enter" | "exit" }) {
  const color = tone === "enter" ? "var(--action-enter)" : tone === "exit" ? "var(--action-exit)" : "var(--ink-1)";
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div className="num" style={{ fontSize: "var(--text-lg)", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

/* --------------------------------- Measure ------------------------------- */
/** Win-estimate / Setup-strength well. */
export function Measure({ label, value, locked = false, hint }: { label: string; value: string; locked?: boolean; hint?: string }) {
  return (
    <div style={{ flex: 1, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
        <span className="eyebrow" style={{ fontSize: "var(--text-2xs)" }}>{label}</span>
        {locked && <Icon n="lock" size={10} color="var(--ink-4)" />}
      </div>
      <div className="num" style={{ fontSize: "var(--text-xl)", fontWeight: 800, color: "var(--ink-1)", lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}
