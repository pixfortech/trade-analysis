"use client";

import { useState } from "react";
import { num, tsec } from "@/lib/format";
import { Icon } from "@/components/terminal/ds";
import type { DecisionSnapshot, InputState } from "@/types/api";
import type { PlanEval, PointsToAction, TradePlanSnapshot } from "@/lib/tradePlan";

const TONE: Record<string, string> = { enter: "var(--action-enter)", exit: "var(--action-exit)", wait: "var(--action-wait)", avoid: "var(--action-avoid)", none: "var(--ink-3)" };
const ACTION_TONE: Record<string, keyof typeof TONE> = { ENTER: "enter", HOLD: "enter", WAIT: "wait", "NO ACTION": "none", AVOID: "avoid", EXIT: "exit" };
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * THE single primary decision card. Ruthlessly prioritised so ONE glance answers
 * "what, approved?, why, and where's price vs the plan":
 *   Action → Approval → primary blocker/reason → CMP → points-to-entry → locked
 *   Entry/Stop/Target/Safe-zone → Win vs threshold → Risk → since-analysis move →
 *   VIX/News/Trend/Volume.
 * Everything internal (setup strength, composite evidence, state-machine state,
 * stop cushion, distance-to-T1, raw scores, numeric trend, supporting/blocking
 * lists) is tucked into a collapsible Details panel. No duplicate distance/price
 * chips; no second card.
 */
export interface MonitorSummary {
  analysedCmp: number;
  liveCmp: number | null;
  movement: number | null;
  movementPct: number | null;
  distToTrigger: number | null;
  candleState: "live" | "closed" | null;
}

/** Map a data-input freshness state to a short word + tone (source-specific). */
function freshWord(state: InputState | undefined): { text: string; tone: keyof typeof TONE } {
  switch (state) {
    case "AVAILABLE_FRESH": return { text: "Live", tone: "enter" };
    case "AVAILABLE_STALE": return { text: "Stale", tone: "avoid" };
    case "INSUFFICIENT_DATA": return { text: "Warming", tone: "wait" };
    case "UNAVAILABLE": return { text: "N/A", tone: "exit" };
    default: return { text: "—", tone: "none" };
  }
}

/** Human-readable market-trend state from the breadth score (−1..+1). */
function trendState(breadthScore: number): { text: string; tone: keyof typeof TONE } {
  if (breadthScore >= 0.5) return { text: "Strong Bullish", tone: "enter" };
  if (breadthScore >= 0.15) return { text: "Bullish", tone: "enter" };
  if (breadthScore <= -0.5) return { text: "Strong Bearish", tone: "exit" };
  if (breadthScore <= -0.15) return { text: "Bearish", tone: "exit" };
  return { text: "Neutral", tone: "none" };
}

/** Entry-range status: distance-to-entry, in-zone, or (beyond the zone) the live
 *  continuation / pullback / reversal verdict. Never a bare "price passed entry". */
function entryStatusLabel(points: PointsToAction | null | undefined, approved: boolean, state: string | undefined): { text: string; tone: keyof typeof TONE } | null {
  if (!points || points.direction === "WAIT") return null;
  const side = points.direction === "LONG" ? "Above" : "Below";
  if (points.entryZone === "approach") return { text: points.entryLabel, tone: "wait" }; // "5.85 pts to entry"
  if (points.entryZone === "inside") return { text: "In entry zone", tone: approved ? "enter" : "wait" };
  // Beyond the zone in the trade direction — verdict comes from the live eval.
  if (state === "REVERSAL_RISK") return { text: "No entry · reversal risk", tone: "exit" };
  if (state === "WAIT_PULLBACK") return { text: `${side} entry zone · wait for pullback`, tone: "avoid" };
  if (state === "ENTER_NOW" && approved) return { text: `${side} entry zone · continuation valid`, tone: "enter" };
  return { text: `${side} entry zone · wait`, tone: "wait" };
}

export function DecisionStrip({
  d, plan, evalResult, points, refreshedAt, live, onReanalyse, monitor,
}: {
  d: DecisionSnapshot | null;
  plan: TradePlanSnapshot | null;
  evalResult: PlanEval | null;
  points?: PointsToAction | null;
  refreshedAt: number | null;
  live: boolean;
  onReanalyse: () => void;
  monitor?: MonitorSummary | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  if (!d) {
    return <div style={card}><div style={{ padding: 14, fontSize: 13, color: "var(--ink-3)" }}>Analysing…</div></div>;
  }
  const tone = TONE[ACTION_TONE[d.action] ?? "none"];
  const hasPlan = !!plan && !!evalResult;
  const invalid = evalResult?.state === "INVALIDATED";
  const win = hasPlan ? plan!.winEstimate : d.approval.winEstimate;
  const setup = hasPlan ? plan!.setupStrength : d.approval.setupStrength;
  const winOk = win >= d.approval.minWin;
  const approval = invalid ? "VOID" : hasPlan ? (evalResult!.approved ? `${evalResult!.currentApproval}%` : "NO") : d.approval.current === "APPROVED" ? "YES" : d.approval.current === "N/A" ? "N/A" : "NO";
  const approvalTone: keyof typeof TONE = invalid ? "exit" : (hasPlan ? evalResult!.approved : d.approval.current === "APPROVED") ? "enter" : d.approval.current === "N/A" ? "none" : "wait";

  const lvl = hasPlan
    ? { entry: plan!.entry, stop: plan!.stopLoss, t1: plan!.targets[0] ?? null, zLo: plan!.safeLow, zHi: plan!.safeHigh, inZone: evalResult!.cmp != null && plan!.safeLow != null && plan!.safeHigh != null && evalResult!.cmp >= plan!.safeLow && evalResult!.cmp <= plan!.safeHigh }
    : d.plan
      ? { entry: d.plan.trigger ?? d.plan.entry, stop: d.plan.stopLoss, t1: d.plan.targets[0] ?? null, zLo: d.plan.safeZone?.lo ?? null, zHi: d.plan.safeZone?.hi ?? null, inZone: d.plan.inSafeZone }
      : null;
  const blocker = d.conflicts[0] ?? d.blocking[0] ?? null;

  // Source-specific freshness (never a bare "live" when a source is stale).
  const quoteState = d.dataQuality.inputs.find((i) => i.name === "Live price")?.state;
  const candleInput = d.dataQuality.inputs.find((i) => i.name === "Candles");
  const q = freshWord(quoteState);
  const c = freshWord(candleInput?.state);
  const dataDegraded = d.dataQuality.overall !== "OK";

  // Since-analysis movement (shown ONCE — no duplicate analysed→live block).
  const mvt = points?.movementSinceAnalysis ?? monitor?.movement ?? null;
  const mvtPct = monitor?.movementPct ?? null;
  const mvtStr = mvt == null ? "—" : `${mvt >= 0 ? "+" : ""}${num(mvt)}${mvtPct != null ? ` (${mvt >= 0 ? "+" : ""}${mvtPct}%)` : ""}`;
  const entryStatus = entryStatusLabel(points, hasPlan ? evalResult!.approved : false, evalResult?.state);
  const hasBaseline = !!monitor && monitor.liveCmp != null;
  const tr = d.trend.note ? null : trendState(d.trend.breadthScore);

  return (
    <div style={{ ...card, borderColor: tone }}>
      {/* 1 ACTION · bias · 2 APPROVAL */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid var(--border-1)", borderLeft: `4px solid ${tone}` }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: tone }}>{d.action}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: d.bias === "Bullish" ? "var(--action-enter)" : d.bias === "Bearish" ? "var(--action-exit)" : "var(--ink-3)" }}>{d.bias} setup</span>
        </span>
        <span style={{ textAlign: "right", flexShrink: 0 }}>
          <span className="num" style={{ fontSize: 17, fontWeight: 800, color: TONE[approvalTone] }}>{approval}</span>
          <span className="eyebrow" style={{ fontSize: 8, display: "block" }}>approval</span>
        </span>
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* 3 PRIMARY blocker / reason */}
        <div style={{ minWidth: 0 }}>
          {blocker ? (
            <p style={{ fontSize: 12.5, color: "var(--action-exit)", lineHeight: 1.35 }}><span style={{ fontWeight: 800 }}>Blocked: </span>{blocker}</p>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.35 }}><span style={{ fontWeight: 700, color: "var(--ink-3)" }}>Why: </span>{d.reason}</p>
          )}
          {blocker && <p style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.reason}>{d.reason}</p>}
        </div>

        {/* 4 Analysed CMP → Live CMP → Movement — proves the session is continuing. */}
        {hasBaseline ? (
          <div style={grid3}>
            <Stat label="Analysed CMP" value={num(monitor!.analysedCmp)} tone="none" />
            <Stat label="Live CMP" value={num(monitor!.liveCmp!)} tone="none" />
            <Stat label="Movement" value={mvtStr} tone={mvt == null ? "none" : mvt >= 0 ? "enter" : "exit"} />
          </div>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
            <span className="eyebrow" style={{ fontSize: 8 }}>Live CMP</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 800, color: "var(--ink-1)" }}>{num(d.cmp)}</span>
          </span>
        )}

        {/* 5 Entry-range status (pts-to-entry / in-zone / continuation / reversal) · freshness */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 12 }}>
          {entryStatus && <span style={{ fontWeight: 800, color: TONE[entryStatus.tone] }}>{entryStatus.text}</span>}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", padding: "1px 7px", borderRadius: "var(--radius-pill)", border: `1px solid ${dataDegraded ? "var(--action-avoid-border)" : "var(--border-2)"}`, background: dataDegraded ? "var(--action-avoid-soft)" : "var(--surface-sunken)", fontSize: 10 }} title={candleInput?.note ? `Candles ${candleInput.note}` : undefined}>
            <span style={{ fontWeight: 800, color: "var(--ink-4)", fontSize: 8.5 }}>QUOTE</span><span style={{ fontWeight: 800, color: TONE[q.tone] }}>{q.text}</span>
            <span style={{ color: "var(--ink-4)" }}>·</span>
            <span style={{ fontWeight: 800, color: "var(--ink-4)", fontSize: 8.5 }}>CANDLE</span><span style={{ fontWeight: 800, color: TONE[c.tone] }}>{c.text}</span>
          </span>
        </div>

        {/* 6 Entry · 7 Stop · 8 Target 1 · 9 Safe zone (locked levels win) */}
        {lvl && (
          <div style={grid4}>
            <Stat label={hasPlan ? "🔒 Entry" : "Entry"} value={lvl.entry != null ? num(lvl.entry) : "—"} tone="none" />
            <Stat label="Stop" value={lvl.stop != null ? num(lvl.stop) : "—"} tone="exit" />
            <Stat label="Target 1" value={lvl.t1 != null ? num(lvl.t1) : "—"} tone="enter" />
            <Stat label="Safe zone" value={lvl.zLo != null && lvl.zHi != null ? `${num(lvl.zLo)}–${num(lvl.zHi)}` : "—"} tone={lvl.inZone ? "enter" : "wait"} />
          </div>
        )}

        {/* 10 Win vs threshold · 11 Risk · 13 VIX / News / Trend / Volume */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Chip label="Win" value={`${win}% / ${d.approval.minWin}%`} tone={winOk ? "enter" : "avoid"} strong />
          <Chip label="Risk" value={d.risk} tone={d.risk === "Low" ? "enter" : d.risk === "High" ? "exit" : "wait"} />
          <Chip label="VIX" value={d.vix.available ? `${d.vix.value} · ${cap(d.vix.status)}` : "n/a"} tone={!d.vix.available ? "none" : d.vix.score >= 0 ? "enter" : "avoid"} />
          <Chip label="News" value={d.newsSummary.available ? `${cap(d.newsSummary.label)} · ${d.newsDecisionImpact.directRelevantCount} rel` : "n/a"} tone={!d.newsSummary.available || d.newsDecisionImpact.directRelevantCount === 0 ? "none" : d.newsSummary.label === "positive" ? "enter" : d.newsSummary.label === "negative" ? "exit" : "none"} />
          <Chip label="Trend" value={tr ? tr.text : "n/a"} tone={tr ? tr.tone : "none"} />
          <Chip label="Vol" value={d.scores.volumeOi >= 60 ? "confirmed" : d.scores.volumeOi <= 40 ? "weak" : "—"} tone={d.scores.volumeOi >= 60 ? "enter" : d.scores.volumeOi <= 40 ? "avoid" : "none"} />
        </div>

        {/* Footer: Details toggle · freshness time · Re-analyse */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button type="button" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: "0 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-2)", background: "var(--surface-sunken)", color: "var(--ink-3)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {showDetails ? "Hide details ▲" : "Details ▾"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 9.5, color: "var(--ink-4)", whiteSpace: "nowrap" }} className="hide-sm">{refreshedAt ? tsec(refreshedAt) : ""} · {live ? "streaming" : "paused"}</span>
            <button type="button" onClick={onReanalyse} style={reBtn}><Icon n="refresh" size={12} /> Re-analyse</button>
          </div>
        </div>

        {/* DETAILS — internals only, hidden by default */}
        {showDetails && (
          <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={grid4}>
              <Stat label="Setup strength" value={`${setup}%`} tone="none" />
              <Stat label="Composite evidence" value={`${d.confidence}%`} tone="none" />
              <Stat label="State" value={d.state.replace(/_/g, " ")} tone="none" small />
              <Stat label="Regime" value={d.regime.replace(/_/g, " ")} tone="none" small />
            </div>
            {points && points.direction !== "WAIT" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {points.pointsToStop != null && <Chip label="Stop cushion" value={num(points.pointsToStop)} tone={points.pointsToStop >= 0 ? "none" : "exit"} />}
                {points.pointsToTarget1 != null && <Chip label="Dist to T1" value={num(points.pointsToTarget1)} tone="none" />}
              </div>
            )}
            <div>
              <div className="eyebrow" style={{ fontSize: 8, marginBottom: 4 }}>Composite score breakdown</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 6 }}>
                {([
                  ["Technical", d.scores.technical], ["Price act.", d.scores.priceAction], ["Trend", d.scores.trend], ["Momentum", d.scores.momentum],
                  ["Volume/OI", d.scores.volumeOi], ["VIX", d.scores.vix], ["News", d.scores.news], ["Market", d.scores.market],
                ] as [string, number][]).map(([k, v]) => <Stat key={k} label={k} value={`${Math.round(v)}`} tone="none" small />)}
              </div>
            </div>
            <p style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
              Trend breadth: <span className="num" style={{ color: "var(--ink-2)", fontWeight: 700 }}>{d.trend.note ? d.trend.note : `${d.trend.breadthAdv} adv / ${d.trend.breadthDec} dec · score ${d.trend.breadthScore.toFixed(2)}`}</span>
            </p>
            {d.supporting.length > 0 && (
              <p style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}><span style={{ fontWeight: 700, color: "var(--action-enter)" }}>Supporting: </span>{d.supporting.join(" · ")}</p>
            )}
            {(d.blocking.length > 1 || (d.conflicts.length > 0 && d.blocking.length > 0)) && (
              <p style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}><span style={{ fontWeight: 700, color: "var(--action-exit)" }}>Blocking: </span>{[...d.conflicts, ...d.blocking].filter((x, i, a) => a.indexOf(x) === i).join(" · ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" };
const grid4: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 };
const reBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--brand-500)", background: "var(--brand-50)", color: "var(--brand-600)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };

function Stat({ label, value, tone, small }: { label: string; value: string; tone: keyof typeof TONE; small?: boolean }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "5px 8px", minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div className="num" style={{ fontSize: small ? 11 : 14, fontWeight: 800, color: TONE[tone], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: small ? "capitalize" : "none" }}>{value}</div>
    </div>
  );
}
function Chip({ label, value, tone, strong }: { label: string; value: string; tone: keyof typeof TONE; strong?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: "var(--radius-pill)", border: `1px solid ${strong ? TONE[tone] : "var(--border-2)"}`, background: "var(--surface-sunken)", fontSize: 10.5, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 800, color: "var(--ink-4)", textTransform: "uppercase", fontSize: 9 }}>{label}</span>
      <span style={{ fontWeight: 700, color: TONE[tone] }}>{value}</span>
    </span>
  );
}
