"use client";

import { num } from "@/lib/format";
import { deriveOhlc, estimateTiming, groupIndicators, type IndTone } from "@/lib/marketContext";
import { Icon } from "@/components/terminal/ds";
import type { ChartDataResponse, LiveSignal } from "@/types/api";
import type { PlanEval, TradePlanSnapshot } from "@/lib/tradePlan";

const TONE: Record<IndTone | "warn" | "info", { text: string; soft: string; border: string; dot: string }> = {
  bull: { text: "var(--action-enter)", soft: "var(--action-enter-soft)", border: "var(--action-enter-border)", dot: "var(--action-enter)" },
  bear: { text: "var(--action-exit)", soft: "var(--action-exit-soft)", border: "var(--action-exit-border)", dot: "var(--action-exit)" },
  neutral: { text: "var(--ink-3)", soft: "var(--surface-sunken)", border: "var(--border-1)", dot: "var(--ink-4)" },
  warn: { text: "var(--action-avoid)", soft: "var(--action-avoid-soft)", border: "var(--action-avoid-border)", dot: "var(--action-avoid)" },
  info: { text: "var(--action-wait)", soft: "var(--action-wait-soft)", border: "var(--action-wait-border)", dot: "var(--action-wait)" },
};

/* ------------------------------- OHLC strip ------------------------------ */
export function OhlcStrip({ signal, chart }: { signal: LiveSignal; chart: ChartDataResponse | null }) {
  const pts = deriveOhlc(signal, chart);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 6, padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)" }}>
      {pts.map((p) => {
        const c = p.tone === "up" ? "var(--price-up)" : p.tone === "down" ? "var(--price-down)" : "var(--ink-1)";
        return (
          <div key={p.label} style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
            <div className="num" style={{ fontSize: 14, fontWeight: 700, color: p.value == null ? "var(--ink-4)" : c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.value == null ? "—" : num(p.value)}</div>
            <div style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.time ?? p.note ?? "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- indicator grouping -------------------------- */
export function IndicatorGroups({ signal }: { signal: LiveSignal }) {
  const groups = groupIndicators(signal);
  if (groups.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map((g) => {
        const t = TONE[g.tone];
        return (
          <div key={g.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
              <span className="eyebrow" style={{ color: t.text }}>{g.label}</span>
              <span className="num" style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)" }}>{g.items.length}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {g.items.map((c) => (
                <span key={c.key} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, maxWidth: "100%", padding: "4px 9px", borderRadius: "var(--radius-pill)", border: `1px solid ${t.border}`, background: t.soft, whiteSpace: "nowrap", overflow: "hidden" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.text }}>{c.key}</span>
                  <span className="num" style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-1)" }}>{c.value}</span>
                  <span style={{ fontSize: 10, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis" }}>{c.reason}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------- entry / exit timing ------------------------- */
export function TimingEstimate({ plan, ev, signal, vix }: { plan: TradePlanSnapshot; ev: PlanEval; signal: LiveSignal | null; vix: number | null }) {
  const t = estimateTiming(plan, ev, signal, vix);
  const tone = TONE[t.tone];
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon n="clock" size={13} color="var(--ink-3)" />
          <span className="eyebrow">Estimated entry / exit window</span>
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", border: "1px solid var(--border-2)", borderRadius: "var(--radius-pill)", padding: "2px 8px", whiteSpace: "nowrap" }}>{t.volatility}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Line label="Entry" text={t.entry} color={tone.text} />
        <Line label="Exit" text={t.exit} color="var(--action-exit)" />
      </div>
      <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 8 }}>Advisory time estimate from live structure — not a guarantee. Locked levels don&apos;t change here.</p>
    </div>
  );
}

function Line({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color, minWidth: 34 }}>{label}</span>
      <span style={{ fontSize: 12, lineHeight: 1.4, color: "var(--ink-2)" }}>{text}</span>
    </div>
  );
}
