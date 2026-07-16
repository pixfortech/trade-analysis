"use client";

import { useMemo, useState } from "react";
import { inr, num, tsec } from "@/lib/format";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { computeProfitPreview, computeSafeExit, type TradeDirection } from "@/lib/profitPreview";
import type { TradePlanSnapshot } from "@/lib/tradePlan";

/**
 * Tentative Profit / Loss preview for the LOCKED plan. READ-ONLY / advisory — an
 * ESTIMATE only, never an order or executed sizing. Fully decoupled from entry
 * APPROVAL: it renders even when entry is not approved (labelled a scenario
 * estimate). The locked levels never move here; only the live-CMP distance and
 * the derived safe-exit update each tick. Position size uses the REAL catalogue
 * lot size × a config-driven lot count. Gross is never presented as net — until
 * a cost engine is configured, net is explicitly "unavailable".
 */
export function TentativePnL({
  plan,
  cmp,
  lotSize,
  approved,
  updatedAt,
}: {
  plan: TradePlanSnapshot;
  cmp: number | null;
  lotSize: number | null;
  approved: boolean;
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

  return (
    <div style={{ ...card }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", borderBottom: open ? "1px solid var(--border-1)" : "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span className="eyebrow" style={{ color: "var(--ink-1)" }}>Tentative P/L</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ink-4)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "0 6px" }}>{p.lots} lot{p.lots === 1 ? "" : "s"} · {num(p.quantity, 0)} qty</span>
          {!approved && <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--action-wait)" }}>scenario estimate</span>}
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{open ? "Hide ▲" : "Details ▾"}</span>
      </button>

      {/* COMPACT ROW: To Entry | Safe Exit | Safe Profit | Target Profit | Max Loss | RR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 6, padding: "8px 10px" }}>
        <Cell label="To entry" value={p.pointsToEntry != null ? `${num(p.pointsToEntry, 2)} pts` : "—"} tone="ink" />
        <Cell label="Safe exit" value={p.safeExit != null ? num(p.safeExit, 2) : "—"} tone="ink" />
        <Cell label="Safe profit" value={p.safeGrossProfit != null ? inr(p.safeGrossProfit) : "—"} sub={p.safeProfitPoints != null ? `${num(p.safeProfitPoints, 2)} pts` : undefined} tone="up" />
        <Cell label="Target profit" value={p.target1MaxProfit != null ? inr(p.target1MaxProfit) : "—"} sub={p.target1ProfitPoints != null ? `${num(p.target1ProfitPoints, 2)} pts` : undefined} tone="up" />
        <Cell label="Max loss" value={p.maxLoss != null ? inr(p.maxLoss) : "—"} sub={p.maxLossPoints != null ? `${num(p.maxLossPoints, 2)} pts` : undefined} tone="down" />
        <Cell label="R:R" value={p.riskReward != null ? `${num(p.riskReward, 2)}` : "—"} tone="ink" />
      </div>

      {open && (
        <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Lots control (real lot size × lots = quantity) */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Lots</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Step onClick={() => setLots((n) => Math.max(1, n - 1))} label="−" />
              <span className="num" style={{ minWidth: 22, textAlign: "center", fontWeight: 800, color: "var(--ink-1)" }}>{lots}</span>
              <Step onClick={() => setLots((n) => Math.min(10000, n + 1))} label="+" />
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>× lot size <span className="num" style={{ color: "var(--ink-1)", fontWeight: 700 }}>{num(realLot, 0)}</span> = <span className="num" style={{ color: "var(--ink-1)", fontWeight: 700 }}>{num(p.quantity, 0)}</span> qty</span>
          </div>

          {/* Net / costs — never present gross as net */}
          <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
            {p.costsEnabled ? (
              <>
                Est. costs (round-trip): <span className="num" style={{ fontWeight: 700 }}>{p.estimatedCosts != null ? inr(p.estimatedCosts) : "—"}</span> ·
                {" "}Net at safe exit <span className="num" style={{ fontWeight: 700, color: "var(--price-up)" }}>{p.safeNetProfit != null ? inr(p.safeNetProfit) : "—"}</span> ·
                {" "}Net at Target 1 <span className="num" style={{ fontWeight: 700, color: "var(--price-up)" }}>{p.target1NetProfit != null ? inr(p.target1NetProfit) : "—"}</span>
              </>
            ) : (
              <span style={{ color: "var(--ink-3)" }}>Figures are GROSS. Net estimate unavailable until trading costs are configured.</span>
            )}
          </div>

          {/* Reason + timestamp */}
          <p style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.45 }}>
            Safe exit {p.safeExit != null ? `₹${num(p.safeExit, 2)}` : "—"} is a conservative partial-booking level derived from ATR / structure and is never beyond Target 1 (₹{plan.targets[0] != null ? num(plan.targets[0]!, 2) : "—"}). Estimate only — not approval.
            {updatedAt ? <span className="hide-sm"> · updated {tsec(updatedAt)}</span> : null}
          </p>
          {!approved && (
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--action-wait)" }}>Scenario estimate — entry not currently approved.</p>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" };
const TONE = { ink: "var(--ink-1)", up: "var(--price-up)", down: "var(--price-down)" } as const;

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: keyof typeof TONE }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "5px 8px", minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div className="num" style={{ fontSize: 13, fontWeight: 800, color: TONE[tone], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
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
