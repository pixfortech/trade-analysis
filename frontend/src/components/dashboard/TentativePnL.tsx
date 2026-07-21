"use client";

import { useMemo, useState } from "react";
import { inr, num, tsec } from "@/lib/format";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { computeProfitPreview, computeSafeExit, type TradeDirection } from "@/lib/profitPreview";
import type { TradePlanSnapshot } from "@/lib/tradePlan";

/**
 * Tentative Profit / Loss preview for the LOCKED plan. READ-ONLY / advisory — an
 * ESTIMATE only, never an order or executed sizing.
 *
 * Approval-aware presentation:
 *  - APPROVED / ENTER  → active state with green profit emphasis (an opportunity).
 *  - NOT approved / WAIT / NO ACTION / AVOID / STALE → a DISABLED scenario: every
 *    profit figure is dark-grey (no green), only Max Loss stays visible in a
 *    restrained red, a "SCENARIO ONLY — ENTRY NOT APPROVED" badge + one concise
 *    reason + a "hypothetical estimates only" helper are shown. Never phrased as
 *    "enter at your own risk"; the ENTER alert/buzz is suppressed upstream.
 *  - PLAN VOID (invalidated) → the preview is disabled entirely (no figures).
 *
 * The locked levels never move here; only the live-CMP distance and the derived
 * safe-exit update. Position size uses the REAL catalogue lot size × config lots.
 * Gross is never presented as net.
 */
export function TentativePnL({
  plan,
  cmp,
  lotSize,
  approved,
  planVoid,
  reversalRisk,
  notApprovedReason,
  updatedAt,
}: {
  plan: TradePlanSnapshot;
  cmp: number | null;
  lotSize: number | null;
  /** ENTER approved AND live data fresh → active (green) styling. */
  approved: boolean;
  /** Locked invalidation broken → disable the preview entirely. */
  planVoid: boolean;
  /** Breakout failed / reversal building → show "No safe fresh entry", no figures. */
  reversalRisk?: boolean;
  /** One concise reason shown while not approved (null when approved). */
  notApprovedReason: string | null;
  updatedAt: number | null;
}) {
  const cfg = usePublicConfig();
  const t = cfg.trade;
  const [lots, setLots] = useState<number>(Math.max(1, Math.round(t.defaultLots)));
  const [open, setOpen] = useState(false);

  const direction: TradeDirection | null = plan.direction === "WAIT" ? null : plan.direction;
  const realLot = lotSize && lotSize > 0 ? lotSize : 1;

  const preview = useMemo(() => {
    if (!direction || plan.entry == null) return null;
    const safeExit = computeSafeExit({
      direction,
      entry: plan.entry,
      target1: plan.targets[0] ?? null,
      atr: plan.snapshot.atr,
      resistance1: plan.snapshot.resistance1 ?? null,
      support1: plan.snapshot.support1 ?? null,
      atrMult: t.safeExit.atrMult,
      minSpanFraction: t.safeExit.minSpanFraction,
      maxSpanFraction: t.safeExit.maxSpanFraction,
      structureBufferPct: t.safeExit.structureBufferPct,
    });
    return computeProfitPreview({
      direction,
      cmp,
      entry: plan.entry,
      safeExit,
      target1: plan.targets[0] ?? null,
      stopLoss: plan.stopLoss,
      lotSize: realLot,
      lots,
      costs: t.costs,
    });
  }, [direction, plan, cmp, realLot, lots, t]);

  if (!direction || !preview) return null;
  const p = preview;

  // ---- PLAN VOID / REVERSAL RISK: no profit figures ----------------------
  // A void plan or an active reversal must NOT keep advertising a profit estimate.
  if (planVoid || reversalRisk) {
    const headline = reversalRisk ? "No safe fresh entry" : "Preview disabled";
    const fallback = reversalRisk
      ? "Breakout failed and reversal evidence is building — no safe fresh entry."
      : "Plan void — the locked invalidation level was broken. Re-analyse for a fresh plan.";
    return (
      <div style={{ ...card, background: "var(--surface-sunken)", opacity: 0.92 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="eyebrow" style={{ color: "var(--ink-4)" }}>Tentative P/L</span>
            <Badge />
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: reversalRisk ? "var(--action-exit)" : "var(--ink-4)" }}>{headline}</span>
        </div>
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          <p style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.45 }}>{notApprovedReason || fallback}</p>
          <p style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.45 }}>{HELPER_TEXT}</p>
        </div>
      </div>
    );
  }

  // ---- DISABLED SCENARIO vs ACTIVE ---------------------------------------
  const disabled = !approved;
  const muted = "var(--ink-4)";
  const cellTone = (active: keyof typeof TONE): keyof typeof TONE => (disabled ? "muted" : active);
  const lossTone: keyof typeof TONE = disabled ? "loss" : "down"; // restrained red vs active red

  return (
    <div style={{ ...card, ...(disabled ? { background: "var(--surface-sunken)" } : {}) }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", borderBottom: open ? "1px solid var(--border-1)" : "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <span className="eyebrow" style={{ color: disabled ? muted : "var(--ink-1)" }}>Tentative P/L</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ink-4)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "0 6px" }}>{p.lots} lot{p.lots === 1 ? "" : "s"} · {num(p.quantity, 0)} qty</span>
          {disabled && <Badge />}
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{open ? "Hide ▲" : "Details ▾"}</span>
      </button>

      {/* Concise reason + helper — always visible while disabled (not hidden behind expand). */}
      {disabled && (
        <div style={{ padding: "0 12px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
          {notApprovedReason && <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--action-avoid)", lineHeight: 1.4 }}>{notApprovedReason}</p>}
          <p style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.4 }}>{HELPER_TEXT}</p>
        </div>
      )}

      {/* COMPACT ROW: To Entry | Safe Exit | Safe Profit | Target Profit | Max Loss | RR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 6, padding: "6px 10px 8px" }}>
        <Cell label="To entry" value={p.pointsToEntry != null ? `${num(p.pointsToEntry, 2)} pts` : "—"} tone={cellTone("ink")} />
        <Cell label="Safe exit" value={p.safeExit != null ? num(p.safeExit, 2) : "—"} tone={cellTone("ink")} />
        <Cell label="Safe profit" value={p.safeGrossProfit != null ? inr(p.safeGrossProfit) : "—"} sub={p.safeProfitPoints != null ? `${num(p.safeProfitPoints, 2)} pts` : undefined} tone={cellTone("up")} />
        <Cell label="Target profit" value={p.target1MaxProfit != null ? inr(p.target1MaxProfit) : "—"} sub={p.target1ProfitPoints != null ? `${num(p.target1ProfitPoints, 2)} pts` : undefined} tone={cellTone("up")} />
        <Cell label="Max loss" value={p.maxLoss != null ? inr(p.maxLoss) : "—"} sub={p.maxLossPoints != null ? `${num(p.maxLossPoints, 2)} pts` : undefined} tone={lossTone} />
        <Cell label="R:R" value={p.riskReward != null ? `${num(p.riskReward, 2)}` : "—"} tone={cellTone("ink")} />
      </div>

      {open && (
        <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Lots control (real lot size × lots = quantity) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Lots</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Step onClick={() => setLots((n) => Math.max(1, n - 1))} label="−" />
              <span className="num" style={{ minWidth: 22, textAlign: "center", fontWeight: 800, color: disabled ? muted : "var(--ink-1)" }}>{lots}</span>
              <Step onClick={() => setLots((n) => Math.min(10000, n + 1))} label="+" />
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>× lot size <span className="num" style={{ color: disabled ? muted : "var(--ink-1)", fontWeight: 700 }}>{num(realLot, 0)}</span> = <span className="num" style={{ color: disabled ? muted : "var(--ink-1)", fontWeight: 700 }}>{num(p.quantity, 0)}</span> qty</span>
          </div>

          {/* Net / costs — never present gross as net */}
          <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {p.costsEnabled ? (
              <>
                Est. costs (round-trip): <span className="num" style={{ fontWeight: 700 }}>{p.estimatedCosts != null ? inr(p.estimatedCosts) : "—"}</span> ·
                {" "}Net at safe exit <span className="num" style={{ fontWeight: 700, color: disabled ? muted : "var(--price-up)" }}>{p.safeNetProfit != null ? inr(p.safeNetProfit) : "—"}</span> ·
                {" "}Net at Target 1 <span className="num" style={{ fontWeight: 700, color: disabled ? muted : "var(--price-up)" }}>{p.target1NetProfit != null ? inr(p.target1NetProfit) : "—"}</span>
              </>
            ) : (
              <span style={{ color: "var(--ink-3)" }}>Figures are GROSS. Net estimate unavailable until trading costs are configured.</span>
            )}
          </div>

          {/* Safe-exit rationale + timestamp */}
          <p style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.45 }}>
            Safe exit {p.safeExit != null ? `₹${num(p.safeExit, 2)}` : "—"} is a conservative partial-booking level derived from ATR / structure and is never beyond Target 1 (₹{plan.targets[0] != null ? num(plan.targets[0]!, 2) : "—"}). Estimate only — not approval.
            {updatedAt ? <span className="hide-sm"> · updated {tsec(updatedAt)}</span> : null}
          </p>
        </div>
      )}
    </div>
  );
}

const HELPER_TEXT = "Hypothetical estimates only. The app does not recommend entry under current conditions.";

/** "Not an opportunity" badge shown whenever entry is not actively approved. */
function Badge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.02em", color: "var(--action-avoid)", border: "1px solid var(--action-avoid-border)", background: "var(--action-avoid-soft)", borderRadius: "var(--radius-pill)", padding: "1px 7px", whiteSpace: "nowrap" }}>
      SCENARIO ONLY — ENTRY NOT APPROVED
    </span>
  );
}

const card: React.CSSProperties = { borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" };
const TONE = {
  ink: "var(--ink-1)",
  up: "var(--price-up)",
  down: "var(--price-down)",
  muted: "var(--ink-4)", // dark-grey (disabled figures)
  loss: "var(--action-exit)", // restrained red (disabled Max Loss)
} as const;

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: keyof typeof TONE }) {
  const dim = tone === "muted" || tone === "loss";
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: dim ? "var(--surface-app)" : "var(--surface-sunken)", padding: "5px 8px", minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div className="num" style={{ fontSize: 13, fontWeight: tone === "loss" ? 700 : 800, color: TONE[tone], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div className="num" style={{ fontSize: 9.5, color: "var(--ink-4)" }}>{sub}</div>}
    </div>
  );
}

function Step({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label === "+" ? "Increase lots" : "Decrease lots"}
      style={{ width: 24, height: 24, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-sunken)", color: "var(--ink-2)", fontSize: 14, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>
      {label}
    </button>
  );
}
