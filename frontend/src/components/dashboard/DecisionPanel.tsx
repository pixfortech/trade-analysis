"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { tsec, num } from "@/lib/format";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import { Icon } from "@/components/terminal/ds";
import type { DecisionSnapshot } from "@/types/api";

const TONE: Record<string, string> = { enter: "var(--action-enter)", exit: "var(--action-exit)", wait: "var(--action-wait)", avoid: "var(--action-avoid)", none: "var(--ink-3)" };
const ACTION_TONE: Record<string, keyof typeof TONE> = { ENTER: "enter", HOLD: "enter", WAIT: "wait", "NO ACTION": "none", AVOID: "avoid", EXIT: "exit" };
const DQ_TONE: Record<string, string> = { OK: "var(--action-enter)", DEGRADED: "var(--action-avoid)", STALE: "var(--action-exit)" };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", cursor: "pointer" };

/**
 * Real-time Decision — compact, summary-first view of one tick of the backend
 * decision loop (stateful ENTER/WAIT/HOLD/EXIT/AVOID/NO ACTION). Everything past
 * the essentials is collapsed. Read-only/advisory; refreshes on the Live toggle
 * + on Kite reconnect. Never fabricates data; surfaces stale/missing inputs.
 */
export function DecisionPanel({ instrument, interval, riskProfile, live }: { instrument: string; interval: string; riskProfile: string; live: boolean }) {
  const [d, setD] = useState<DecisionSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const { value: detailsOpen, setValue: setDetailsOpen } = useLocalStorage<boolean>("cockpit.decision.details.v1", false);
  const cfg = usePublicConfig();

  const load = useCallback(async () => {
    try {
      const res = await api.decision({ instrument, interval, riskProfile });
      setD(res);
      setRefreshedAt(Date.now());
      setStatus("idle");
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Decision engine unavailable.");
      setStatus("error");
    }
  }, [instrument, interval, riskProfile]);

  useEffect(() => { setStatus("loading"); setD(null); void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void load(), cfg.refresh.intelligenceMs);
    return () => window.clearInterval(id);
  }, [live, load, cfg.refresh.intelligenceMs]);
  useKiteConnected(() => { setStatus("loading"); setErr(null); void load(); });

  const tone = d ? TONE[ACTION_TONE[d.action] ?? "none"] : TONE.none;

  return (
    <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <Icon n="activity" size={14} color="var(--brand-500)" />
          <span className="eyebrow" style={{ color: "var(--ink-1)" }}>Real-time Decision</span>
          {d && <StateChip state={d.state} pending={d.pending} />}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap" }} className="hide-sm">{refreshedAt ? `updated ${tsec(refreshedAt)}` : status === "loading" ? "…" : "—"} · {live ? "live" : "paused"}</span>
          <button type="button" onClick={() => void load()} title="Refresh decision" aria-label="Refresh" style={iconBtn}><Icon n="refresh" size={13} /></button>
        </span>
      </div>

      <div style={{ padding: 12 }}>
        {status === "loading" && !d ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Evaluating live structure, regime, VIX, news and breadth…</p>
        ) : status === "error" && !d ? (
          <p style={{ fontSize: 13, color: "var(--action-exit)", background: "var(--action-exit-soft)", border: "1px solid var(--action-exit-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>Decision unavailable — {err}. Connect/authorise Kite.</p>
        ) : d ? (
          <>
            {/* data-quality banner (only when not OK) */}
            {d.dataQuality.overall !== "OK" && (
              <div style={{ marginBottom: 10, borderRadius: "var(--radius-md)", border: `1px solid ${DQ_TONE[d.dataQuality.overall]}`, background: "var(--surface-sunken)", padding: "7px 10px", fontSize: 11.5, color: "var(--ink-2)" }}>
                <strong style={{ color: DQ_TONE[d.dataQuality.overall] }}>Data {d.dataQuality.overall.toLowerCase()}:</strong> {d.dataQuality.inputs.filter((i) => i.state === "AVAILABLE_STALE" || i.state === "UNAVAILABLE" || i.state === "INSUFFICIENT_DATA").map((i) => `${i.name} ${i.state.replace(/_/g, " ").toLowerCase()}`).join(" · ") || "some inputs degraded"}
              </div>
            )}

            {/* action banner */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: "var(--radius-md)", border: `1px solid ${tone}`, background: "var(--surface-sunken)", padding: "10px 12px", borderLeft: `4px solid ${tone}` }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 19, fontWeight: 800, color: tone }}>{d.action}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)" }}>{d.displayName} · {num(d.cmp)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "1px 7px" }}>{d.regime.replace(/_/g, " ")}</span>
                </span>
                <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2, textWrap: "pretty" }}>{d.reason}</p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: tone }}>{d.confidence}%</div>
                <div className="eyebrow" style={{ fontSize: 9 }}>confidence · {d.risk} risk</div>
              </div>
            </div>

            {/* approval / win / setup strength — kept SEPARATE (never merged) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, marginTop: 10 }}>
              <Stat label="Current approval" value={d.approval.current} tone={d.approval.current === "APPROVED" ? "enter" : d.approval.current === "N/A" ? "none" : "wait"} />
              <Stat label={`Win est. (≥${d.approval.minWin}%)`} value={`${d.approval.winEstimate}%`} tone={d.approval.winEstimate >= d.approval.minWin ? "enter" : "wait"} />
              <Stat label="Setup strength" value={`${d.approval.setupStrength}%`} tone="none" />
              <Stat label="Bias" value={d.bias} tone={d.bias === "Bullish" ? "enter" : d.bias === "Bearish" ? "exit" : "none"} />
            </div>

            {/* plan levels (locked position OR best candidate) */}
            {d.plan && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 8, marginTop: 8 }}>
                {d.plan.trigger != null && <Stat label="Trigger" value={num(d.plan.trigger)} tone="wait" />}
                <Stat label="Entry" value={num(d.plan.entry)} tone="none" />
                <Stat label="Stop" value={num(d.plan.stopLoss)} tone="exit" />
                {d.plan.targets.slice(0, 2).map((t, i) => <Stat key={i} label={`Target ${i + 1}`} value={num(t)} tone="enter" />)}
                {d.plan.rr != null && <Stat label="R:R" value={`${d.plan.rr}`} tone="none" />}
              </div>
            )}

            {/* context chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              <Chip label="VIX" value={d.vix.available ? `${d.vix.value} ${d.vix.status}` : "n/a"} tone={!d.vix.available ? "none" : d.vix.score >= 0 ? "enter" : "avoid"} />
              <Chip label="News" value={d.newsSummary.available ? `${d.newsSummary.label} · ${d.newsSummary.matched} stock` : "n/a"} tone="none" />
              <Chip label="Breadth" value={d.trend.note ? "n/a" : `${d.trend.breadthAdv}/${d.trend.breadthDec}`} tone={d.trend.breadthScore > 0 ? "enter" : d.trend.breadthScore < 0 ? "exit" : "none"} />
              {d.exit && <Chip label="Exit" value={d.exit.status} tone={d.exit.status.includes("EXIT") ? "exit" : d.exit.status.includes("CAUTION") || d.exit.status.includes("WARNING") ? "avoid" : "enter"} />}
            </div>

            {/* fresh setup */}
            {d.freshSetup && (
              <div style={{ marginTop: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--action-wait-border)", background: "var(--action-wait-soft)", padding: "8px 10px" }}>
                <span className="eyebrow" style={{ color: "var(--action-wait-strong)" }}>Fresh setup detected · {d.freshSetup.direction}</span>
                <p style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2 }}>{d.freshSetup.label} — trigger {d.freshSetup.trigger != null ? num(d.freshSetup.trigger) : "market"}, stop {num(d.freshSetup.stop)}. {d.freshSetup.whyDiffers}</p>
              </div>
            )}

            {/* conflicts — always visible when present (blocking factors) */}
            {d.conflicts.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <span className="eyebrow" style={{ color: "var(--action-exit)" }}>Conflicts</span>
                <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                  {d.conflicts.map((c, i) => <li key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--ink-2)" }}><span style={{ color: "var(--action-exit)" }}>✕</span>{c}</li>)}
                </ul>
              </div>
            )}

            {/* timing */}
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.4 }}>{d.timing.entryWindow} {d.exit ? d.timing.exitWindow : ""}</p>

            {/* expandable details */}
            <button type="button" onClick={() => setDetailsOpen(!detailsOpen)} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "3px 0", background: "transparent", border: "none", color: "var(--brand-500)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {detailsOpen ? "Hide" : "Details"} — scores · factors · setups · history <Icon n={detailsOpen ? "chevron-up" : "chevron-down"} size={13} />
            </button>
            {detailsOpen && <Details d={d} />}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Details({ d }: { d: DecisionSnapshot }) {
  const scoreRows: [string, number][] = [
    ["Technical", d.scores.technical], ["Price action", d.scores.priceAction], ["Trend", d.scores.trend], ["Momentum", d.scores.momentum],
    ["Volume/OI", d.scores.volumeOi], ["VIX", d.scores.vix], ["News", d.scores.news], ["Market", d.scores.market], ["Risk", d.scores.risk],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      <div>
        <span className="eyebrow">Scores (each separate — no hidden merge)</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, marginTop: 6 }}>
          {scoreRows.map(([k, v]) => (
            <div key={k} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-3)" }}><span>{k}</span><span className="num">{v}</span></div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--surface-sunken)", overflow: "hidden", marginTop: 2 }}><div style={{ width: `${v}%`, height: "100%", background: v >= 60 ? "var(--action-enter)" : v <= 40 ? "var(--action-exit)" : "var(--ink-4)" }} /></div>
            </div>
          ))}
        </div>
      </div>

      {(d.supporting.length > 0 || d.blocking.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
          {d.supporting.length > 0 && <FactorList title="Supporting" items={d.supporting} tone="enter" />}
          {d.blocking.length > 0 && <FactorList title="Blocking" items={d.blocking} tone="exit" />}
        </div>
      )}

      {d.setups.length > 0 && (
        <div>
          <span className="eyebrow">Detected setups</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {d.setups.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "5px 8px" }}>
                <span style={{ minWidth: 0 }}><strong style={{ color: "var(--ink-1)" }}>{s.label}</strong> <span style={{ color: "var(--ink-3)" }}>· {s.direction}{s.secondary ? " · confirmation" : ""}{s.triggered ? " · triggered" : ""}</span></span>
                <span className="num" style={{ color: "var(--ink-2)", flexShrink: 0 }}>{s.confidence}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.history.length > 0 && (
        <div>
          <span className="eyebrow">Decision history (audit trail)</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, maxHeight: 180, overflowY: "auto" }}>
            {[...d.history].reverse().map((h, i) => (
              <div key={i} style={{ fontSize: 10.5, color: "var(--ink-3)", borderLeft: "2px solid var(--border-2)", paddingLeft: 8 }}>
                <span className="num" style={{ color: "var(--ink-4)" }}>{h.at.slice(11, 23)}</span>{" "}
                <strong style={{ color: "var(--ink-1)" }}>{h.fromAction} → {h.toAction}</strong>{" "}
                <span>@ {num(h.cmp)} · win {h.winEstimate}% · {h.marketTrend}</span>
                <div style={{ color: "var(--ink-3)" }}>{h.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p style={{ fontSize: 10, color: "var(--ink-4)" }}>{d.disclaimer}</p>
    </div>
  );
}

function StateChip({ state, pending }: { state: string; pending: DecisionSnapshot["pending"] }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-3)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "1px 7px", whiteSpace: "nowrap" }}>
      {state.replace(/_/g, " ")}{pending ? ` · confirming ${pending.count}/${pending.required}` : ""}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "6px 8px", minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 8.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div className="num" style={{ fontSize: 13, fontWeight: 800, color: TONE[tone], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
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

function FactorList({ title, items, tone }: { title: string; items: string[]; tone: keyof typeof TONE }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "8px 10px" }}>
      <span className="eyebrow" style={{ color: TONE[tone] }}>{title}</span>
      <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((t, i) => <li key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.35 }}><span style={{ color: TONE[tone], flexShrink: 0 }}>{tone === "enter" ? "✓" : "✕"}</span><span>{t}</span></li>)}
      </ul>
    </div>
  );
}
