"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { tsec } from "@/lib/format";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Icon } from "@/components/terminal/ds";
import type { IntelFactorCard, MarketIntelligenceResponse, NewsItem } from "@/types/api";

const TONE_C: Record<string, string> = { bull: "var(--action-enter)", bear: "var(--action-exit)", warn: "var(--action-avoid)", neutral: "var(--ink-3)" };
const ACTION_TONE: Record<string, "bull" | "bear" | "warn" | "neutral"> = { ENTER: "bull", HOLD: "bull", WAIT: "warn", "NO ACTION": "neutral", AVOID: "bear", EXIT: "bear" };

function fmtAge(m: number | null): string {
  if (m == null) return "time n/a";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.floor(h / 24)} d ago`;
}

/**
 * Real-time Intelligence — combines technicals + India VIX + news sentiment +
 * market breadth into a single ENTER/WAIT/HOLD/EXIT/AVOID/NO ACTION call, with
 * reasons, factor cards, a detailed study and relevant headlines. Read-only.
 * Refreshes on the global Live toggle; manual refresh always works.
 */
export function MarketIntelligence({ instrument, interval, riskProfile, live }: { instrument: string; interval: string; riskProfile: string; live: boolean }) {
  const [data, setData] = useState<MarketIntelligenceResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const { value: studyOpen, setValue: setStudyOpen } = useLocalStorage<boolean>("cockpit.intel.study.v1", false);

  const load = useCallback(async () => {
    try {
      const res = await api.intelligence({ instrument, interval, riskProfile });
      setData(res);
      setRefreshedAt(Date.now());
      setStatus("idle");
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Intelligence unavailable.");
      setStatus("error");
    }
  }, [instrument, interval, riskProfile]);

  useEffect(() => { setStatus("loading"); setData(null); void load(); }, [load]);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(id);
  }, [live, load]);

  const finalTone = data ? ACTION_TONE[data.finalAction] ?? "neutral" : "neutral";
  const newsList: NewsItem[] = data ? [...data.newsMatched.slice(0, 3), ...data.news.items.filter((i) => !data.newsMatched.some((m) => m.title === i.title)).slice(0, 3)] : [];

  return (
    <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--border-1)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <Icon n="activity" size={14} color="var(--brand-500)" />
          <span className="eyebrow" style={{ color: "var(--ink-1)" }}>Real-time Intelligence</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap" }} className="hide-sm">{refreshedAt ? `updated ${tsec(refreshedAt)}` : status === "loading" ? "loading…" : "—"} · {live ? "live" : "paused"}</span>
          <button type="button" onClick={() => void load()} title="Refresh intelligence" aria-label="Refresh" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", cursor: "pointer" }}><Icon n="refresh" size={13} /></button>
        </span>
      </div>

      <div style={{ padding: 12 }}>
        {status === "loading" && !data ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Fusing technicals + VIX + news + market breadth…</p>
        ) : status === "error" && !data ? (
          <p style={{ fontSize: 13, color: "var(--action-exit)", background: "var(--action-exit-soft)", border: "1px solid var(--action-exit-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
            Intelligence unavailable — {err}. Connect/authorise Kite; the technical signal is required.
          </p>
        ) : data ? (
          <>
            {/* final action banner */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, borderRadius: "var(--radius-md)", border: `1px solid ${TONE_C[finalTone]}`, background: "var(--surface-sunken)", padding: "10px 12px", borderLeft: `4px solid ${TONE_C[finalTone]}` }}>
              <div style={{ minWidth: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", color: TONE_C[finalTone] }}>{data.finalAction}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-2)" }}>{data.bias} · {data.risk} risk</span>
                </span>
                <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2, textWrap: "pretty" }}>{data.reason}</p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: TONE_C[finalTone] }}>{data.confidence}%</div>
                <div className="eyebrow" style={{ fontSize: 9 }}>confidence · {data.caution}</div>
              </div>
            </div>

            {/* factor cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 10 }}>
              {data.cards.map((c) => <FactorCardView key={c.key} c={c} />)}
            </div>

            {/* supporting / blocking */}
            {(data.supporting.length > 0 || data.blocking.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
                {data.supporting.length > 0 && <FactorList title="Supporting" items={data.supporting} tone="bull" />}
                {data.blocking.length > 0 && <FactorList title="Blocking" items={data.blocking} tone="bear" />}
              </div>
            )}

            {/* windows */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 10 }}>
              <WindowRow label="Entry window" text={data.entryWindow} tone="bull" />
              <WindowRow label="Exit / hold window" text={data.exitWindow} tone="bear" />
            </div>

            {/* detailed study */}
            <button type="button" onClick={() => setStudyOpen(!studyOpen)} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "4px 0", background: "transparent", border: "none", color: "var(--brand-500)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {studyOpen ? "Hide" : "Detailed study"} <Icon n={studyOpen ? "chevron-up" : "chevron-down"} size={13} />
            </button>
            {studyOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <StudyRow label="Technical" text={data.study.technical} />
                <StudyRow label="VIX / volatility" text={data.study.vix} />
                <StudyRow label="News" text={data.study.news} />
                <StudyRow label="Market trend" text={data.study.trend} />
                <StudyRow label="Risk" text={data.study.risk} />
                <StudyRow label="Recommendation" text={data.study.recommendation} />
              </div>
            )}

            {/* news */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span className="eyebrow">News {data.news.available ? `· ${data.newsMatched.length} on ${data.displayName.split(" ")[0]}` : ""}</span>
                {data.news.available && <span style={{ fontSize: 10, color: "var(--ink-4)" }}>{data.news.sources.slice(0, 3).join(" · ")}</span>}
              </div>
              {!data.news.available ? (
                <p style={{ fontSize: 12, color: "var(--ink-3)", background: "var(--surface-sunken)", border: "1px solid var(--border-1)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                  News unavailable — {data.news.message ?? "no feed"}. Final decision is technical + VIX only.
                </p>
              ) : newsList.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>No relevant headlines right now.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {newsList.map((n, i) => <NewsRow key={`${n.title}-${i}`} n={n} />)}
                </div>
              )}
            </div>

            <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 10 }}>Advisory only — read-only, no order execution. Combines live technicals with VIX, news sentiment and breadth; missing inputs are shown as unavailable, never fabricated.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function FactorCardView({ c }: { c: IntelFactorCard }) {
  const col = TONE_C[c.tone] ?? "var(--ink-2)";
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "8px 10px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span className="eyebrow" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: col, whiteSpace: "nowrap" }}>{c.status}</span>
      </div>
      <div className="num" style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.value}</div>
      <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{c.reason}</div>
    </div>
  );
}

function FactorList({ title, items, tone }: { title: string; items: string[]; tone: "bull" | "bear" }) {
  const col = tone === "bull" ? "var(--action-enter)" : "var(--action-exit)";
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "8px 10px" }}>
      <span className="eyebrow" style={{ color: col }}>{title}</span>
      <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.35 }}>
            <span style={{ color: col, flexShrink: 0 }}>{tone === "bull" ? "✓" : "✕"}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WindowRow({ label, text, tone }: { label: string; text: string; tone: "bull" | "bear" }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "8px 10px" }}>
      <span className="eyebrow" style={{ color: tone === "bull" ? "var(--action-enter)" : "var(--action-exit)" }}>{label}</span>
      <p style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>{text}</p>
    </div>
  );
}

function StudyRow({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "8px 10px" }}>
      <span className="eyebrow">{label}</span>
      <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.45, textWrap: "pretty" }}>{text}</p>
    </div>
  );
}

function NewsRow({ n }: { n: NewsItem }) {
  const sc = n.sentiment === "positive" ? "var(--action-enter)" : n.sentiment === "negative" ? "var(--action-exit)" : "var(--ink-3)";
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
        <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: sc, border: `1px solid ${sc}`, borderRadius: "var(--radius-pill)", padding: "1px 6px" }}>{n.sentiment}</span>
        {n.impact !== "low" && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--action-avoid)", border: "1px solid var(--action-avoid-border)", borderRadius: "var(--radius-pill)", padding: "1px 6px" }}>{n.impact} impact</span>}
        {n.matched && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--brand-600)" }}>{n.matched}</span>}
        <span style={{ fontSize: 10, color: "var(--ink-4)", marginLeft: "auto" }}>{n.source} · {fmtAge(n.ageMinutes)}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-1)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.title}</p>
      <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{n.reason}</p>
    </>
  );
  const box: React.CSSProperties = { display: "block", borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "7px 10px", textDecoration: "none" };
  return n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" style={box}>{inner}</a> : <div style={box}>{inner}</div>;
}
