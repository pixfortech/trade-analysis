"use client";

import { useState } from "react";
import { numFlex } from "@/lib/format";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { deriveOhlc, estimateTiming, groupIndicators, type IndChip, type IndTone, type OhlcPoint } from "@/lib/marketContext";
import { Icon } from "@/components/terminal/ds";
import type { ChartDataResponse, LiveSignal } from "@/types/api";
import type { PlanEval, TradePlanSnapshot } from "@/lib/tradePlan";

const TONE: Record<IndTone | "warn" | "info", { text: string; soft: string; border: string; dot: string }> = {
  bull: { text: "var(--action-enter)", soft: "var(--action-enter-soft)", border: "var(--action-enter-border)", dot: "var(--action-enter)" },
  bear: { text: "var(--action-exit)", soft: "var(--action-exit-soft)", border: "var(--action-exit-border)", dot: "var(--action-exit)" },
  neutral: { text: "var(--ink-3)", soft: "var(--surface-card)", border: "var(--border-1)", dot: "var(--ink-4)" },
  warn: { text: "var(--action-avoid)", soft: "var(--action-avoid-soft)", border: "var(--action-avoid-border)", dot: "var(--action-avoid)" },
  info: { text: "var(--action-wait)", soft: "var(--action-wait-soft)", border: "var(--action-wait-border)", dot: "var(--action-wait)" },
};

/* ------------------------------- OHLC strip ------------------------------ */
// Default display order. The card renders from the SAVED order (not fixed JSX);
// users can rearrange it and the choice persists in localStorage.
export const OHLC_DEFAULT_ORDER = ["Prev close", "High", "Low", "Open", "CMP"];
const OHLC_ORDER_KEY = "cockpit.ohlc.order.v1";

/** Reorder derived points by the saved label order; append any not covered. */
function orderPoints(pts: OhlcPoint[], order: string[]): OhlcPoint[] {
  const byLabel = new Map(pts.map((p) => [p.label, p]));
  const seen = new Set<string>();
  const out: OhlcPoint[] = [];
  for (const label of order) {
    const p = byLabel.get(label);
    if (p && !seen.has(label)) { out.push(p); seen.add(label); }
  }
  for (const p of pts) if (!seen.has(p.label)) out.push(p); // defensive: new labels
  return out;
}

export function OhlcStrip({ signal, chart }: { signal: LiveSignal; chart: ChartDataResponse | null }) {
  const pts = deriveOhlc(signal, chart);
  const { value: order, setValue: setOrder, reset } = useLocalStorage<string[]>(OHLC_ORDER_KEY, OHLC_DEFAULT_ORDER);
  const [editing, setEditing] = useState(false);
  const [dragI, setDragI] = useState<number | null>(null);

  const ordered = orderPoints(pts, order);
  const labels = ordered.map((p) => p.label); // current on-screen order (normalised)

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= labels.length) return;
    const next = [...labels];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const drop = (i: number) => {
    if (dragI == null || dragI === i) { setDragI(null); return; }
    const next = [...labels];
    const [moved] = next.splice(dragI, 1);
    next.splice(i, 0, moved);
    setOrder(next);
    setDragI(null);
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Values grid — unchanged layout/colours/spacing; only the ORDER varies. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))", gap: 6, padding: 10, borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)" }}>
        {ordered.map((p) => {
          const c = p.tone === "up" ? "var(--price-up)" : p.tone === "down" ? "var(--price-down)" : "var(--ink-1)";
          return (
            <div key={p.label} style={{ minWidth: 0 }}>
              <div className="eyebrow" style={{ fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
              <div className="num" style={{ fontSize: 14, fontWeight: 700, color: p.value == null ? "var(--ink-4)" : c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.value == null ? "—" : numFlex(p.value)}</div>
              <div style={{ fontSize: 10, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.time ?? p.note ?? "—"}</div>
            </div>
          );
        })}
      </div>

      {/* Small Arrange affordance — sits in the top-right padding, corner is empty
          (cell content is left-aligned) so it never overlaps a value. */}
      <button type="button" onClick={() => setEditing((v) => !v)} title="Arrange OHLC order" aria-label="Arrange OHLC order" aria-expanded={editing}
        style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: editing ? "var(--brand-500)" : "var(--ink-3)", cursor: "pointer", opacity: 0.85 }}>
        <Icon n="pencil" size={11} />
      </button>

      {editing && (
        <>
          <div onClick={() => setEditing(false)} style={{ position: "fixed", inset: 0, zIndex: 41 }} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 42, width: 240, maxWidth: "calc(100vw - 28px)", background: "var(--surface-raised)", border: "1px solid var(--border-1)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-float)", padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="eyebrow">Arrange OHLC</span>
              <button type="button" onClick={() => { reset(); setDragI(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--ink-3)", background: "transparent", border: "none", cursor: "pointer" }}>
                <Icon n="refresh" size={11} /> Reset
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ordered.map((p, i) => (
                <div key={p.label} draggable onDragStart={() => setDragI(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)} onDragEnd={() => setDragI(null)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-1)", background: dragI === i ? "var(--surface-sunken)" : "var(--surface-card)", cursor: "grab" }}>
                  <Icon n="grip-vertical" size={13} color="var(--ink-4)" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up" aria-label={`Move ${p.label} up`} style={{ ...ohlcMoveBtn, opacity: i === 0 ? 0.35 : 1 }}><Icon n="chevron-up" size={13} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === ordered.length - 1} title="Move down" aria-label={`Move ${p.label} down`} style={{ ...ohlcMoveBtn, opacity: i === ordered.length - 1 ? 0.35 : 1 }}><Icon n="chevron-down" size={13} /></button>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 8 }}>Drag, or use ↑/↓. Saved on this device.</p>
          </div>
        </>
      )}
    </div>
  );
}

const ohlcMoveBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", cursor: "pointer", flexShrink: 0 };

/* --------------------------- indicator grouping -------------------------- */
function ChipView({ tone, c }: { tone: IndTone; c: IndChip }) {
  const t = TONE[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, maxWidth: "100%", padding: "4px 9px", borderRadius: "var(--radius-pill)", border: `1px solid ${t.border}`, background: t.soft, whiteSpace: "nowrap", overflow: "hidden" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: t.text }}>{c.key}</span>
      <span className="num" style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-1)" }}>{c.value}</span>
      <span style={{ fontSize: 10, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis" }}>{c.reason}</span>
    </span>
  );
}

function CountChip({ tone, label, n }: { tone: IndTone; label: string; n: number }) {
  const t = TONE[tone];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: "var(--radius-pill)", border: `1px solid ${t.border}`, background: t.soft, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: t.text }}>{label}</span>
      <span className="num" style={{ fontSize: 11, fontWeight: 800, color: t.text }}>{n}</span>
    </span>
  );
}

/**
 * Indicators — summary-first and collapsible. Default shows total + per-group
 * counts (strongest group first) and the strongest group's compact chips; Expand
 * reveals the full grouped detail. Preference persisted in localStorage.
 */
export function IndicatorGroups({ signal, storageKey = "cockpit.indicators.expanded.v2" }: { signal: LiveSignal; storageKey?: string }) {
  const groups = groupIndicators(signal);
  const { value: expanded, setValue: setExpanded } = useLocalStorage<boolean>(storageKey, false);
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const lead = groups[0]; // strongest group (groupIndicators already count-sorts)
  const shown = Math.min(lead.items.length, 5);
  const more = total - shown;

  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
          <span className="eyebrow">Indicators</span>
          <span className="num" style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>{total} active</span>
          {groups.map((g) => (
            <CountChip key={g.label} tone={g.tone} label={g.label} n={g.items.length} />
          ))}
        </span>
        <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "3px 9px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          {expanded ? "Collapse" : "Expand indicators"}
          <Icon n={expanded ? "chevron-up" : "chevron-down"} size={13} />
        </button>
      </div>

      {!expanded ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {lead.items.slice(0, 5).map((c) => <ChipView key={c.key} tone={lead.tone} c={c} />)}
          {more > 0 && (
            <button type="button" onClick={() => setExpanded(true)} style={{ padding: "4px 9px", borderRadius: "var(--radius-pill)", border: "1px dashed var(--border-2)", background: "transparent", color: "var(--ink-3)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              +{more} more
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: TONE[g.tone].dot, flexShrink: 0 }} />
                <span className="eyebrow" style={{ color: TONE[g.tone].text }}>{g.label}</span>
                <span className="num" style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)" }}>{g.items.length}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.items.map((c) => <ChipView key={c.key} tone={g.tone} c={c} />)}
              </div>
            </div>
          ))}
        </div>
      )}
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
