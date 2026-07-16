"use client";

import { useState } from "react";
import { num } from "@/lib/format";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { IndicatorGroups } from "./MarketContext";
import { TradeGuidance } from "./TradeGuidance";
import type { DecisionSnapshot, NewsItem } from "@/types/api";
import type { LiveSignal } from "@/types/api";
import type { PlanEval, TradePlanSnapshot } from "@/lib/tradePlan";

type TabId = "overview" | "plan" | "indicators" | "news" | "context" | "audit";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Trade Plan" },
  { id: "indicators", label: "Indicators" },
  { id: "news", label: "News" },
  { id: "context", label: "Market Context" },
  { id: "audit", label: "Audit" },
];
const REL_LABEL: Record<string, string> = { DIRECT_INSTRUMENT: "Direct", UNDERLYING: "Underlying", SECTOR: "Sector", BENCHMARK: "Benchmark", MARKET_WIDE: "Market", MACRO: "Macro", IRRELEVANT: "—" };

function fmtAge(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * Secondary evidence, tabbed. Only ONE tab body is in the DOM at a time (no
 * hidden height). Overview is the default and shows only the strongest factors +
 * next confirmation + state. Full study lives in the other tabs.
 */
export function EvidenceTabs({ d, plan, evalResult, signal, vix, onReanalyse }: {
  d: DecisionSnapshot | null;
  plan: TradePlanSnapshot | null;
  evalResult: PlanEval | null;
  signal: LiveSignal;
  vix: number | null;
  onReanalyse: () => void;
}) {
  const { value: tab, setValue: setTab } = useLocalStorage<TabId>("cockpit.evidence.tab.v1", "overview");

  return (
    <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 2, padding: 4, borderBottom: "1px solid var(--border-1)", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
            style={{ flexShrink: 0, padding: "5px 11px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", background: tab === t.id ? "var(--brand-500)" : "transparent", color: tab === t.id ? "#fff" : "var(--ink-3)" }}>
            {t.label}{t.id === "news" && d ? ` · ${d.newsDecisionImpact.directRelevantCount}` : ""}
          </button>
        ))}
      </div>
      <div style={{ padding: 12 }}>
        {!d ? (
          <p style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading evidence…</p>
        ) : tab === "overview" ? (
          <Overview d={d} />
        ) : tab === "plan" ? (
          plan && evalResult ? <TradeGuidance plan={plan} evalResult={evalResult} signal={signal} vix={vix} onReanalyse={onReanalyse} /> : <Muted text="Click Re-analyse to lock a trade plan (entry / stop / targets)." />
        ) : tab === "indicators" ? (
          <IndicatorGroups signal={signal} storageKey="cockpit.evidence.indicators.v1" />
        ) : tab === "news" ? (
          <NewsTab d={d} />
        ) : tab === "context" ? (
          <ContextTab d={d} />
        ) : (
          <AuditTab d={d} />
        )}
      </div>
    </div>
  );
}

function Overview({ d }: { d: DecisionSnapshot }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {d.supporting.length > 0 && <FactorBlock title="Supporting" items={d.supporting.slice(0, 3)} tone="var(--action-enter)" mark="✓" />}
      {(d.blocking.length > 0 || d.conflicts.length > 0) && <FactorBlock title="Blocking" items={[...d.conflicts, ...d.blocking].slice(0, 3)} tone="var(--action-exit)" mark="✕" />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Mini label="Next confirmation" value={d.timing.nextConfirmation} />
        <Mini label="Current state" value={d.state.replace(/_/g, " ")} />
      </div>
      {d.freshSetup && <p style={{ fontSize: 11.5, color: "var(--action-wait-strong)", borderRadius: "var(--radius-md)", border: "1px solid var(--action-wait-border)", background: "var(--action-wait-soft)", padding: "6px 9px" }}>Fresh setup · {d.freshSetup.direction} — {d.freshSetup.whyDiffers}</p>}
    </div>
  );
}

function NewsTab({ d }: { d: DecisionSnapshot }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 11, color: "var(--ink-3)" }}>{d.newsDecisionImpact.directRelevantCount} directly relevant · {d.newsDecisionImpact.supportingHeadlineIds.length} supporting · {d.newsDecisionImpact.blockingHeadlineIds.length} blocking · {d.newsDecisionImpact.ignoredCount} ignored.</p>
      {d.relevantNews.length === 0 ? <Muted text="No headlines directly relevant to this instrument affect the decision." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {d.relevantNews.slice(0, 8).map((n, i) => <NewsRow key={n.id ?? i} n={n} impacted={d.newsDecisionImpact.supportingHeadlineIds.includes(n.id ?? "") || d.newsDecisionImpact.blockingHeadlineIds.includes(n.id ?? "")} />)}
        </div>
      )}
      {d.marketContext.length > 0 && (
        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: 5 }}>Broader market context · {d.marketContext.length}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{d.marketContext.slice(0, 5).map((n, i) => <NewsRow key={n.id ?? i} n={n} impacted={false} muted />)}</div>
        </div>
      )}
    </div>
  );
}

function ContextTab({ d }: { d: DecisionSnapshot }) {
  const rows: [string, number][] = [["Technical", d.scores.technical], ["Price action", d.scores.priceAction], ["Trend", d.scores.trend], ["Momentum", d.scores.momentum], ["Volume/OI", d.scores.volumeOi], ["VIX", d.scores.vix], ["News", d.scores.news], ["Market", d.scores.market], ["Risk", d.scores.risk]];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6 }}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-3)" }}><span>{k}</span><span className="num">{v}</span></div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--surface-sunken)", overflow: "hidden", marginTop: 2 }}><div style={{ width: `${v}%`, height: "100%", background: v >= 60 ? "var(--action-enter)" : v <= 40 ? "var(--action-exit)" : "var(--ink-4)" }} /></div>
          </div>
        ))}
      </div>
      <Mini label="Regime" value={`${d.regime.replace(/_/g, " ")} — ${d.regimeReasons[0] ?? ""}`} />
      <Mini label="VIX" value={d.vix.available ? d.vix.interpretation : "unavailable"} />
      {d.setups.length > 0 && (
        <div>
          <span className="eyebrow" style={{ display: "block", marginBottom: 5 }}>Detected setups</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {d.setups.map((s, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}><span><strong style={{ color: "var(--ink-1)" }}>{s.label}</strong> <span style={{ color: "var(--ink-3)" }}>· {s.direction}{s.secondary ? " · confirm" : ""}{s.triggered ? " · triggered" : ""}</span></span><span className="num" style={{ color: "var(--ink-2)" }}>{s.confidence}%</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTab({ d }: { d: DecisionSnapshot }) {
  if (d.history.length === 0) return <Muted text="No transitions yet — the decision has been stable." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 260, overflowY: "auto" }}>
      {[...d.history].reverse().map((h, i) => (
        <div key={i} style={{ fontSize: 10.5, color: "var(--ink-3)", borderLeft: "2px solid var(--border-2)", paddingLeft: 8 }}>
          <span className="num" style={{ color: "var(--ink-4)" }}>{h.at.slice(11, 23)}</span> <strong style={{ color: "var(--ink-1)" }}>{h.fromAction} → {h.toAction}</strong> @ {num(h.cmp)} · win {h.winEstimate}%
          <div>{h.reason}</div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- bits ---------------------------------- */
function FactorBlock({ title, items, tone, mark }: { title: string; items: string[]; tone: string; mark: string }) {
  return (
    <div>
      <span className="eyebrow" style={{ color: tone, display: "block", marginBottom: 4 }}>{title}</span>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((t, i) => <li key={i} style={{ display: "flex", gap: 6, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.35 }}><span style={{ color: tone, flexShrink: 0 }}>{mark}</span><span>{t}</span></li>)}
      </ul>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "6px 9px", minWidth: 0 }}><div className="eyebrow" style={{ fontSize: 8.5 }}>{label}</div><div style={{ fontSize: 11.5, color: "var(--ink-1)", lineHeight: 1.3 }}>{value}</div></div>;
}
function Muted({ text }: { text: string }) {
  return <p style={{ fontSize: 12, color: "var(--ink-3)" }}>{text}</p>;
}
function NewsRow({ n, impacted, muted }: { n: NewsItem; impacted: boolean; muted?: boolean }) {
  const sc = n.sentiment === "positive" ? "var(--action-enter)" : n.sentiment === "negative" ? "var(--action-exit)" : "var(--ink-3)";
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 1 }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase", color: muted ? "var(--ink-4)" : "var(--brand-600)", border: `1px solid ${muted ? "var(--border-2)" : "var(--brand-500)"}`, borderRadius: "var(--radius-pill)", padding: "0 5px" }}>{REL_LABEL[n.relevanceType ?? "IRRELEVANT"]}{n.relevanceScore != null ? ` ${n.relevanceScore}` : ""}</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase", color: sc }}>{n.sentiment}</span>
        {n.impact !== "low" && <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", color: "var(--action-avoid)" }}>{n.impact}</span>}
        {impacted && <span style={{ fontSize: 8.5, fontWeight: 800, color: "var(--action-enter)" }}>· affected</span>}
        <span style={{ fontSize: 9.5, color: "var(--ink-4)", marginLeft: "auto" }}>{n.source} · {fmtAge(n.ageMinutes)}</span>
      </div>
      <p style={{ fontSize: 11.5, color: muted ? "var(--ink-3)" : "var(--ink-1)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.title}</p>
      {n.relevanceReason && <p style={{ fontSize: 9.5, color: "var(--ink-4)" }}>{n.relevanceReason}</p>}
    </>
  );
  const box: React.CSSProperties = { display: "block", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "5px 8px", textDecoration: "none" };
  return n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" style={box}>{inner}</a> : <div style={box}>{inner}</div>;
}
