"use client";

import { num, tsec } from "@/lib/format";
import { Icon } from "@/components/terminal/ds";
import type { DecisionSnapshot } from "@/types/api";
import type { PlanEval, TradePlanSnapshot } from "@/lib/tradePlan";

const TONE: Record<string, string> = { enter: "var(--action-enter)", exit: "var(--action-exit)", wait: "var(--action-wait)", avoid: "var(--action-avoid)", none: "var(--ink-3)" };
const ACTION_TONE: Record<string, keyof typeof TONE> = { ENTER: "enter", HOLD: "enter", WAIT: "wait", "NO ACTION": "none", AVOID: "avoid", EXIT: "exit" };
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * THE single primary decision strip. One glance = instrument action, approval,
 * win, risk, the locked Entry/Stop/Target/Safe-zone, and the VIX/news/trend/
 * volume context, plus one reason + one blocker. No paragraphs; no duplicate
 * cards. Locked plan levels win when a plan exists (levels never silently move).
 */
export function DecisionStrip({
  d, plan, evalResult, refreshedAt, live, onReanalyse,
}: {
  d: DecisionSnapshot | null;
  plan: TradePlanSnapshot | null;
  evalResult: PlanEval | null;
  refreshedAt: number | null;
  live: boolean;
  onReanalyse: () => void;
}) {
  if (!d) {
    return <div style={card}><div style={{ padding: 14, fontSize: 13, color: "var(--ink-3)" }}>Analysing…</div></div>;
  }
  const tone = TONE[ACTION_TONE[d.action] ?? "none"];
  const hasPlan = !!plan && !!evalResult;
  const invalid = evalResult?.state === "INVALIDATED";
  const win = hasPlan ? plan!.winEstimate : d.approval.winEstimate;
  const setup = hasPlan ? plan!.setupStrength : d.approval.setupStrength;
  const approval = invalid ? "Void" : hasPlan ? (evalResult!.approved ? `${evalResult!.currentApproval}%` : "No") : d.approval.current === "APPROVED" ? "Yes" : d.approval.current === "N/A" ? "N/A" : "No";
  const approvalTone: keyof typeof TONE = invalid ? "exit" : (hasPlan ? evalResult!.approved : d.approval.current === "APPROVED") ? "enter" : d.approval.current === "N/A" ? "none" : "wait";

  const lvl = hasPlan
    ? { entry: plan!.entry, stop: plan!.stopLoss, t1: plan!.targets[0] ?? null, zLo: plan!.safeLow, zHi: plan!.safeHigh, dist: evalResult!.distToEntry, inZone: evalResult!.cmp != null && plan!.safeLow != null && plan!.safeHigh != null && evalResult!.cmp >= plan!.safeLow && evalResult!.cmp <= plan!.safeHigh }
    : d.plan
      ? { entry: d.plan.trigger ?? d.plan.entry, stop: d.plan.stopLoss, t1: d.plan.targets[0] ?? null, zLo: d.plan.safeZone?.lo ?? null, zHi: d.plan.safeZone?.hi ?? null, dist: null, inZone: d.plan.inSafeZone }
      : null;
  const blocker = d.conflicts[0] ?? d.blocking[0] ?? null;

  return (
    <div style={{ ...card, borderColor: tone }}>
      {/* TOP: Action | CMP | Bias | Confidence | Approval */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid var(--border-1)", borderLeft: `4px solid ${tone}` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: tone }}>{d.action}</span>
          <span className="num" style={{ fontSize: 16, fontWeight: 800, color: "var(--ink-1)" }}>{num(d.cmp)}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: d.bias === "Bullish" ? "var(--action-enter)" : d.bias === "Bearish" ? "var(--action-exit)" : "var(--ink-3)" }}>{d.bias}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ink-3)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "1px 7px", textTransform: "uppercase" }}>{d.regime.replace(/_/g, " ")}</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ textAlign: "right" }}><span className="num" style={{ fontSize: 18, fontWeight: 800, color: tone }}>{d.confidence}%</span><span className="eyebrow" style={{ fontSize: 8, display: "block" }}>conf</span></span>
          <span style={{ textAlign: "right" }}><span className="num" style={{ fontSize: 14, fontWeight: 800, color: TONE[approvalTone] }}>{approval}</span><span className="eyebrow" style={{ fontSize: 8, display: "block" }}>approval</span></span>
        </span>
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* SECOND: Win | Setup | Risk | Regime-conf */}
        <div style={grid4}>
          <Stat label={`Win (≥${d.approval.minWin}%)`} value={`${win}%`} tone={win >= d.approval.minWin ? "enter" : "wait"} />
          <Stat label="Setup" value={`${setup}%`} tone="none" />
          <Stat label="Risk" value={d.risk} tone={d.risk === "Low" ? "enter" : d.risk === "High" ? "exit" : "wait"} />
          <Stat label="State" value={d.state.replace(/_/g, " ")} tone="none" small />
        </div>

        {/* THIRD: Entry | Stop | Target 1 | Safe zone (locked levels win) */}
        {lvl && (
          <div style={grid4}>
            <Stat label={hasPlan ? "🔒 Entry" : "Entry"} value={lvl.entry != null ? num(lvl.entry) : "—"} tone="none" />
            <Stat label="Stop" value={lvl.stop != null ? num(lvl.stop) : "—"} tone="exit" />
            <Stat label="Target 1" value={lvl.t1 != null ? num(lvl.t1) : "—"} tone="enter" />
            <Stat label="Safe zone" value={lvl.zLo != null && lvl.zHi != null ? `${num(lvl.zLo)}–${num(lvl.zHi)}` : "—"} tone={lvl.inZone ? "enter" : "wait"} />
          </div>
        )}

        {/* CONTEXT: VIX | News | Trend | Volume/OI */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Chip label="VIX" value={d.vix.available ? `${d.vix.value} · ${cap(d.vix.status)} · ${cap(d.vix.direction)}` : "n/a"} tone={!d.vix.available ? "none" : d.vix.score >= 0 ? "enter" : "avoid"} />
          <Chip label="News" value={d.newsSummary.available ? `${cap(d.newsSummary.label)} · ${d.newsDecisionImpact.directRelevantCount} relevant` : "n/a"} tone={!d.newsSummary.available || d.newsDecisionImpact.directRelevantCount === 0 ? "none" : d.newsSummary.label === "positive" ? "enter" : d.newsSummary.label === "negative" ? "exit" : "none"} />
          <Chip label="Trend" value={d.trend.note ? "n/a" : `${d.trend.breadthAdv}/${d.trend.breadthDec}`} tone={d.trend.breadthScore > 0 ? "enter" : d.trend.breadthScore < 0 ? "exit" : "none"} />
          <Chip label="Vol" value={d.scores.volumeOi >= 60 ? "confirmed" : d.scores.volumeOi <= 40 ? "weak" : "—"} tone={d.scores.volumeOi >= 60 ? "enter" : d.scores.volumeOi <= 40 ? "avoid" : "none"} />
          {lvl?.dist != null && <Chip label="→Entry" value={`${lvl.dist > 0 ? "+" : ""}${num(lvl.dist)}`} tone="none" />}
        </div>

        {/* BOTTOM: reason + blocker + re-analyse */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.35 }}><span style={{ fontWeight: 700, color: "var(--ink-3)" }}>Why: </span>{d.reason}</p>
            {blocker && <p style={{ fontSize: 12, color: "var(--action-exit)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={blocker}><span style={{ fontWeight: 700 }}>Blocked: </span>{blocker}</p>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 9.5, color: "var(--ink-4)", whiteSpace: "nowrap" }} className="hide-sm">{refreshedAt ? tsec(refreshedAt) : ""} · {live ? "live" : "paused"}</span>
            <button type="button" onClick={onReanalyse} style={reBtn}><Icon n="refresh" size={12} /> Re-analyse</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" };
const grid4: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 };
const reBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--brand-500)", background: "var(--brand-50)", color: "var(--brand-600)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };

function Stat({ label, value, tone, small }: { label: string; value: string; tone: keyof typeof TONE; small?: boolean }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "5px 8px", minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div className="num" style={{ fontSize: small ? 11 : 14, fontWeight: 800, color: TONE[tone], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: small ? "capitalize" : "none" }}>{value}</div>
    </div>
  );
}
function Chip({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-2)", background: "var(--surface-sunken)", fontSize: 10.5, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 800, color: "var(--ink-4)", textTransform: "uppercase", fontSize: 9 }}>{label}</span>
      <span style={{ fontWeight: 700, color: TONE[tone] }}>{value}</span>
    </span>
  );
}
