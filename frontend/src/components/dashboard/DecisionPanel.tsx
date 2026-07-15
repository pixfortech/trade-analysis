"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { tsec, num } from "@/lib/format";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import { Icon } from "@/components/terminal/ds";
import type { DecisionSnapshot, NewsItem } from "@/types/api";

const TONE: Record<string, string> = { enter: "var(--action-enter)", exit: "var(--action-exit)", wait: "var(--action-wait)", avoid: "var(--action-avoid)", none: "var(--ink-3)" };
const ACTION_TONE: Record<string, keyof typeof TONE> = { ENTER: "enter", HOLD: "enter", WAIT: "wait", "NO ACTION": "none", AVOID: "avoid", EXIT: "exit" };
const DQ_TONE: Record<string, string> = { OK: "var(--action-enter)", DEGRADED: "var(--action-avoid)", STALE: "var(--action-exit)" };
const REL_LABEL: Record<string, string> = { DIRECT_INSTRUMENT: "Direct", UNDERLYING: "Underlying", SECTOR: "Sector", BENCHMARK: "Benchmark", MARKET_WIDE: "Market", MACRO: "Macro", IRRELEVANT: "—" };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", cursor: "pointer" };
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function fmtAge(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * Real-time Decision — the SINGLE primary decision card. Summary-first: the
 * actionable decision is visible immediately; every detail (scores, factors,
 * relevant news, market context, setups, audit trail) is collapsed. Read-only.
 * News is instrument-scoped: only decision-relevant headlines are shown/counted.
 * Instrument changes clear old data instantly and stale responses are ignored.
 */
export function DecisionPanel({ instrument, interval, riskProfile, live }: { instrument: string; interval: string; riskProfile: string; live: boolean }) {
  const [d, setD] = useState<DecisionSnapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const { value: detailsOpen, setValue: setDetailsOpen } = useLocalStorage<boolean>("cockpit.decision.details.v2", false);
  const cfg = usePublicConfig();
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myId = ++reqId.current; // version guard — ignore stale responses
    try {
      const res = await api.decision({ instrument, interval, riskProfile });
      if (myId !== reqId.current) return; // a newer request superseded this one
      setD(res);
      setRefreshedAt(Date.now());
      setStatus("idle");
      setErr(null);
    } catch (e) {
      if (myId !== reqId.current) return;
      setErr(e instanceof Error ? e.message : "Decision engine unavailable.");
      setStatus("error");
    }
  }, [instrument, interval, riskProfile]);

  // Instrument/timeframe/mode change → clear old data + news instantly, then reload.
  useEffect(() => { reqId.current++; setD(null); setStatus("loading"); setErr(null); void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void load(), cfg.refresh.intelligenceMs);
    return () => window.clearInterval(id);
  }, [live, load, cfg.refresh.intelligenceMs]);
  useKiteConnected(() => { setStatus("loading"); setErr(null); void load(); });

  const tone = d ? TONE[ACTION_TONE[d.action] ?? "none"] : TONE.none;
  const blocker = d ? (d.conflicts[0] ?? d.blocking[0] ?? null) : null;
  const approvalTone: keyof typeof TONE = d?.approval.current === "APPROVED" ? "enter" : d?.approval.current === "N/A" ? "none" : "wait";

  return (
    <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <Icon n="activity" size={14} color="var(--brand-500)" />
          <span className="eyebrow" style={{ color: "var(--ink-1)" }}>Primary Decision</span>
          {d && <StateChip state={d.state} pending={d.pending} />}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap" }} className="hide-sm">{refreshedAt ? tsec(refreshedAt) : "…"} · {live ? "live" : "paused"}</span>
          <button type="button" onClick={() => void load()} title="Re-analyse / refresh" aria-label="Refresh" style={iconBtn}><Icon n="refresh" size={13} /></button>
        </span>
      </div>

      <div style={{ padding: 12 }}>
        {status === "loading" && !d ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Evaluating {instrument.split(":").pop()}…</p>
        ) : status === "error" && !d ? (
          <p style={{ fontSize: 13, color: "var(--action-exit)", background: "var(--action-exit-soft)", border: "1px solid var(--action-exit-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>Unavailable — {err}. Connect/authorise Kite.</p>
        ) : d ? (
          <>
            {d.dataQuality.overall !== "OK" && (
              <div style={{ marginBottom: 10, borderRadius: "var(--radius-md)", border: `1px solid ${DQ_TONE[d.dataQuality.overall]}`, background: "var(--surface-sunken)", padding: "6px 10px", fontSize: 11, color: "var(--ink-2)" }}>
                <strong style={{ color: DQ_TONE[d.dataQuality.overall] }}>Data {d.dataQuality.overall.toLowerCase()}</strong> — {d.dataQuality.inputs.filter((i) => i.state !== "AVAILABLE_FRESH" && i.state !== "NOT_APPLICABLE").map((i) => i.name.toLowerCase()).join(", ") || "some inputs degraded"}
              </div>
            )}

            {/* PRIMARY: Action | Instrument | CMP | Confidence */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: "var(--radius-md)", border: `1px solid ${tone}`, background: "var(--surface-sunken)", padding: "9px 12px", borderLeft: `4px solid ${tone}` }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 9, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: tone }}>{d.action}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-1)" }}>{d.displayName}</span>
                <span className="num" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>{num(d.cmp)}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ink-3)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "1px 7px", textTransform: "uppercase" }}>{d.regime.replace(/_/g, " ")}</span>
              </span>
              <span style={{ textAlign: "right", flexShrink: 0 }}>
                <span className="num" style={{ fontSize: 20, fontWeight: 800, color: tone }}>{d.confidence}%</span>
                <span className="eyebrow" style={{ fontSize: 8.5, display: "block" }}>confidence</span>
              </span>
            </div>

            {/* Win | Setup Strength | Approval | Risk */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
              <Stat label={`Win (≥${d.approval.minWin}%)`} value={`${d.approval.winEstimate}%`} tone={d.approval.winEstimate >= d.approval.minWin ? "enter" : "wait"} />
              <Stat label="Setup" value={`${d.approval.setupStrength}%`} tone="none" />
              <Stat label="Approval" value={d.approval.current === "NOT APPROVED" ? "NO" : d.approval.current === "APPROVED" ? "YES" : "N/A"} tone={approvalTone} />
              <Stat label="Risk" value={d.risk} tone={d.risk === "Low" ? "enter" : d.risk === "High" ? "exit" : "wait"} />
            </div>

            {/* Entry | Stop | Target 1 | Safe Zone */}
            {d.plan && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 6 }}>
                <Stat label={d.plan.trigger != null ? "Trigger" : "Entry"} value={num(d.plan.trigger ?? d.plan.entry)} tone="none" />
                <Stat label="Stop" value={num(d.plan.stopLoss)} tone="exit" />
                <Stat label="Target 1" value={d.plan.targets[0] != null ? num(d.plan.targets[0]) : "—"} tone="enter" />
                <Stat label="Safe zone" value={d.plan.safeZone ? `${num(d.plan.safeZone.lo)}–${num(d.plan.safeZone.hi)}` : "—"} tone={d.plan.inSafeZone ? "enter" : "wait"} />
              </div>
            )}

            {/* one-line why + one-line blocker */}
            <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.4 }}><span style={{ fontWeight: 700, color: "var(--ink-3)" }}>Why: </span>{d.reason}</p>
            {blocker && <p style={{ fontSize: 12, color: "var(--action-exit)", marginTop: 3, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={blocker}><span style={{ fontWeight: 700 }}>Blocked: </span>{blocker}</p>}

            {/* CONTEXT strip: VIX | News | Trend | Volume/OI */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
              <Chip label="VIX" value={d.vix.available ? `${d.vix.value} · ${cap(d.vix.direction)} · ${cap(d.vix.status)}` : "n/a"} tone={!d.vix.available ? "none" : d.vix.score >= 0 ? "enter" : "avoid"} />
              <Chip label="News" value={d.newsSummary.available ? `${cap(d.newsSummary.label)} · ${d.newsDecisionImpact.directRelevantCount} relevant` : "n/a"} tone={!d.newsSummary.available || d.newsDecisionImpact.directRelevantCount === 0 ? "none" : d.newsSummary.label === "positive" ? "enter" : d.newsSummary.label === "negative" ? "exit" : "none"} />
              <Chip label="Trend" value={d.trend.note ? "n/a" : `${d.trend.breadthAdv}/${d.trend.breadthDec}`} tone={d.trend.breadthScore > 0 ? "enter" : d.trend.breadthScore < 0 ? "exit" : "none"} />
              {d.exit && <Chip label="Exit" value={d.exit.status} tone={d.exit.status.includes("EXIT") ? "exit" : d.exit.status.includes("CAUTION") || d.exit.status.includes("WARNING") ? "avoid" : "enter"} />}
            </div>

            {d.freshSetup && (
              <div style={{ marginTop: 9, borderRadius: "var(--radius-md)", border: "1px solid var(--action-wait-border)", background: "var(--action-wait-soft)", padding: "7px 10px", fontSize: 11.5, color: "var(--ink-2)" }}>
                <strong style={{ color: "var(--action-wait-strong)" }}>Fresh setup · {d.freshSetup.direction}</strong> — {d.freshSetup.label}, stop {num(d.freshSetup.stop)}. {d.freshSetup.whyDiffers}
              </div>
            )}

            <button type="button" onClick={() => setDetailsOpen(!detailsOpen)} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, padding: "3px 0", background: "transparent", border: "none", color: "var(--brand-500)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {detailsOpen ? "Hide" : "Details"} — evidence, relevant news &amp; history <Icon n={detailsOpen ? "chevron-up" : "chevron-down"} size={13} />
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
  const highestImpact = d.relevantNews.reduce<string>((acc, n) => (n.impact === "high" ? "high" : acc === "high" ? "high" : n.impact === "medium" ? "medium" : acc), "low");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      {/* More targets + exit plan */}
      {d.plan && (d.plan.targets.length > 1 || d.exit) && (
        <Section title="Targets & exit plan">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {d.plan.targets.slice(1).map((t, i) => <MiniStat key={i} label={`Target ${i + 2}`} value={num(t)} />)}
            {d.plan.rr != null && <MiniStat label="R:R" value={`${d.plan.rr}`} />}
            {d.exit && <MiniStat label="Exit" value={d.exit.status} />}
          </div>
          {d.exit && d.exit.reasons[0] && <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>{d.exit.reasons[0]}</p>}
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>{d.timing.entryWindow}</p>
        </Section>
      )}

      {/* Relevant news (instrument-scoped, auditable) */}
      <Section title={`Relevant news · ${d.newsDecisionImpact.directRelevantCount} deciding${d.relevantNews.length ? ` · highest ${highestImpact}` : ""}`}>
        <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "0 0 6px" }}>
          {d.newsDecisionImpact.directRelevantCount} directly relevant; {d.newsDecisionImpact.supportingHeadlineIds.length} supporting, {d.newsDecisionImpact.blockingHeadlineIds.length} blocking · {d.newsDecisionImpact.ignoredCount} ignored.
        </p>
        {d.relevantNews.length === 0 ? (
          <p style={{ fontSize: 11.5, color: "var(--ink-3)" }}>No headlines directly relevant to this instrument affect the decision.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {d.relevantNews.slice(0, 6).map((n, i) => <NewsRow key={n.id ?? i} n={n} impacted={d.newsDecisionImpact.supportingHeadlineIds.includes(n.id ?? "") || d.newsDecisionImpact.blockingHeadlineIds.includes(n.id ?? "")} />)}
          </div>
        )}
      </Section>

      {/* Broader market context — visually separate, non-deciding */}
      {d.marketContext.length > 0 && (
        <Section title={`Broader market context · ${d.marketContext.length}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {d.marketContext.slice(0, 4).map((n, i) => <NewsRow key={n.id ?? i} n={n} impacted={false} muted />)}
          </div>
        </Section>
      )}

      {/* Scores */}
      <Section title="Scores">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
          {scoreRows.map(([k, v]) => (
            <div key={k} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-3)" }}><span>{k}</span><span className="num">{v}</span></div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--surface-card)", overflow: "hidden", marginTop: 2 }}><div style={{ width: `${v}%`, height: "100%", background: v >= 60 ? "var(--action-enter)" : v <= 40 ? "var(--action-exit)" : "var(--ink-4)" }} /></div>
            </div>
          ))}
        </div>
      </Section>

      {(d.supporting.length > 0 || d.blocking.length > 0 || d.conflicts.length > 0) && (
        <Section title="Supporting / blocking / conflicts">
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {d.supporting.slice(0, 4).map((t, i) => <FactorLine key={`s${i}`} t={t} tone="enter" mark="✓" />)}
            {d.blocking.slice(0, 4).map((t, i) => <FactorLine key={`b${i}`} t={t} tone="exit" mark="✕" />)}
            {d.conflicts.map((t, i) => <FactorLine key={`c${i}`} t={t} tone="avoid" mark="⚠" />)}
          </div>
        </Section>
      )}

      {d.setups.length > 0 && (
        <Section title="Detected setups">
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {d.setups.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                <span style={{ minWidth: 0 }}><strong style={{ color: "var(--ink-1)" }}>{s.label}</strong> <span style={{ color: "var(--ink-3)" }}>· {s.direction}{s.secondary ? " · confirm" : ""}{s.triggered ? " · triggered" : ""}</span></span>
                <span className="num" style={{ color: "var(--ink-2)", flexShrink: 0 }}>{s.confidence}%</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.history.length > 0 && (
        <Section title="Decision history (audit trail)">
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 160, overflowY: "auto" }}>
            {[...d.history].reverse().map((h, i) => (
              <div key={i} style={{ fontSize: 10.5, color: "var(--ink-3)", borderLeft: "2px solid var(--border-2)", paddingLeft: 8 }}>
                <span className="num" style={{ color: "var(--ink-4)" }}>{h.at.slice(11, 23)}</span> <strong style={{ color: "var(--ink-1)" }}>{h.fromAction} → {h.toAction}</strong> @ {num(h.cmp)} · win {h.winEstimate}%
                <div>{h.reason}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
      <p style={{ fontSize: 10, color: "var(--ink-4)" }}>{d.disclaimer}</p>
    </div>
  );
}

function NewsRow({ n, impacted, muted }: { n: NewsItem; impacted: boolean; muted?: boolean }) {
  const sc = n.sentiment === "positive" ? "var(--action-enter)" : n.sentiment === "negative" ? "var(--action-exit)" : "var(--ink-3)";
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 1 }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase", color: muted ? "var(--ink-4)" : "var(--brand-600)", border: `1px solid ${muted ? "var(--border-2)" : "var(--brand-500)"}`, borderRadius: "var(--radius-pill)", padding: "0 5px" }}>{REL_LABEL[n.relevanceType ?? "IRRELEVANT"]}{n.relevanceScore != null ? ` ${n.relevanceScore}` : ""}</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase", color: sc }}>{n.sentiment}</span>
        {n.impact !== "low" && <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "var(--action-avoid)" }}>{n.impact}</span>}
        {impacted && <span style={{ fontSize: 8.5, fontWeight: 800, color: "var(--action-enter)" }}>· affected decision</span>}
        <span style={{ fontSize: 9.5, color: "var(--ink-4)", marginLeft: "auto" }}>{n.source} · {fmtAge(n.ageMinutes)}</span>
      </div>
      <p style={{ fontSize: 11.5, color: muted ? "var(--ink-3)" : "var(--ink-1)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.title}</p>
      {n.relevanceReason && <p style={{ fontSize: 9.5, color: "var(--ink-4)" }}>{n.relevanceReason}</p>}
    </>
  );
  const box: React.CSSProperties = { display: "block", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-1)", background: "var(--surface-card)", padding: "5px 8px", textDecoration: "none" };
  return n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" style={box}>{inner}</a> : <div style={box}>{inner}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="eyebrow" style={{ display: "block", marginBottom: 5 }}>{title}</span>
      {children}
    </div>
  );
}
function StateChip({ state, pending }: { state: string; pending: DecisionSnapshot["pending"] }) {
  return <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-3)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "1px 7px", whiteSpace: "nowrap" }}>{state.replace(/_/g, " ")}{pending ? ` ${pending.count}/${pending.required}` : ""}</span>;
}
function Stat({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "5px 7px", minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div className="num" style={{ fontSize: 13, fontWeight: 800, color: TONE[tone], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <span style={{ display: "inline-flex", flexDirection: "column", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-1)", background: "var(--surface-card)", padding: "3px 8px" }}><span className="eyebrow" style={{ fontSize: 8 }}>{label}</span><span className="num" style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-1)" }}>{value}</span></span>;
}
function Chip({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-2)", background: "var(--surface-sunken)", fontSize: 10.5, whiteSpace: "nowrap" }}>
      <span style={{ fontWeight: 800, color: "var(--ink-4)", textTransform: "uppercase", fontSize: 9 }}>{label}</span>
      <span style={{ fontWeight: 700, color: TONE[tone] }}>{value}</span>
    </span>
  );
}
function FactorLine({ t, tone, mark }: { t: string; tone: keyof typeof TONE; mark: string }) {
  return <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.35 }}><span style={{ color: TONE[tone], flexShrink: 0 }}>{mark}</span><span>{t}</span></div>;
}
