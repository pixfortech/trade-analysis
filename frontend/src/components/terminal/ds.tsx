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
