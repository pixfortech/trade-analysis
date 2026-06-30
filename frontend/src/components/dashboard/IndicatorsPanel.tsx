"use client";

import {
  DEFAULT_INDICATORS,
  INDICATOR_DEFS,
  INDICATOR_ORDER,
  makeInstance,
  instanceLabel,
  type IndicatorInstance,
  type IndicatorType,
} from "@/lib/chartIndicators";
import { Icon } from "@/components/terminal/ds";

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Add / remove / enable / configure native chart indicators (no limit). */
export function IndicatorsPanel({
  indicators,
  setIndicators,
  onClose,
}: {
  indicators: IndicatorInstance[];
  setIndicators: (updater: (cur: IndicatorInstance[]) => IndicatorInstance[]) => void;
  onClose: () => void;
}) {
  const add = (type: IndicatorType) => setIndicators((cur) => [...cur, { ...makeInstance(type), id: uid() }]);
  const remove = (id: string) => setIndicators((cur) => cur.filter((i) => i.id !== id));
  const toggle = (id: string) => setIndicators((cur) => cur.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i)));
  const setParam = (id: string, key: string, val: number) => setIndicators((cur) => cur.map((i) => (i.id === id ? { ...i, params: { ...i.params, [key]: val } } : i)));
  const reset = () => setIndicators(() => DEFAULT_INDICATORS.map((i) => ({ ...i, params: { ...i.params } })));

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 44 }} />
      <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 45, width: 360, maxWidth: "calc(100vw - 24px)", background: "var(--surface-raised)", border: "1px solid var(--border-1)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-float)", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="eyebrow">Indicators · {indicators.filter((i) => i.enabled).length} on</span>
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button type="button" onClick={reset} style={ghostBtn}>Reset</button>
            <button type="button" onClick={onClose} aria-label="Close" style={{ ...iconBtn }}><Icon n="x" size={14} /></button>
          </span>
        </div>

        {/* add */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {INDICATOR_ORDER.map((t) => (
            <button key={t} type="button" onClick={() => add(t)} title={`Add ${INDICATOR_DEFS[t].label}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: "var(--radius-pill)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Icon n="plus" size={11} />{INDICATOR_DEFS[t].label}
            </button>
          ))}
        </div>

        {/* list */}
        <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {indicators.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--ink-3)", padding: "8px 0" }}>No indicators. Add some above.</p>
          ) : (
            indicators.map((inst) => {
              const def = INDICATOR_DEFS[inst.type];
              return (
                <div key={inst.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-1)", opacity: inst.enabled ? 1 : 0.55 }}>
                  <button type="button" onClick={() => toggle(inst.id)} title={inst.enabled ? "Disable" : "Enable"} aria-pressed={inst.enabled}
                    style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 4, border: `1px solid ${inst.enabled ? inst.color : "var(--border-2)"}`, background: inst.enabled ? inst.color : "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    {inst.enabled && <Icon n="check" size={11} color="#fff" />}
                  </button>
                  <span style={{ flexShrink: 0, width: 76, fontSize: 12, fontWeight: 700, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={instanceLabel(inst)}>
                    {def.label}
                    <span style={{ fontSize: 9, fontWeight: 600, color: "var(--ink-4)", marginLeft: 4 }}>{def.pane === "lower" ? "pane" : def.pane === "volume" ? "vol" : "main"}</span>
                  </span>
                  <span style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
                    {def.params.map((pd) => (
                      <label key={pd.key} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--ink-3)" }}>
                        {pd.label}
                        <input type="number" value={inst.params[pd.key]} min={pd.min} max={pd.max}
                          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setParam(inst.id, pd.key, Math.max(pd.min, Math.min(pd.max, v))); }}
                          style={{ width: 44, padding: "2px 5px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-1)", fontSize: 11 }} />
                      </label>
                    ))}
                    {def.params.length === 0 && <span style={{ fontSize: 10, color: "var(--ink-4)" }}>no params</span>}
                  </span>
                  <button type="button" onClick={() => remove(inst.id)} title="Remove" style={{ ...iconBtn, color: "var(--action-exit)" }}><Icon n="x" size={13} /></button>
                </div>
              );
            })
          )}
        </div>

        <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 8 }}>
          Computed from live Kite candles — no limit. Price overlays draw on the chart with your locked Entry/SL/Target lines; oscillators (RSI/MACD/Stoch/ATR/ADX) show as readout cards below. Saved on this device.
        </p>
      </div>
    </>
  );
}

const ghostBtn: React.CSSProperties = { padding: "3px 9px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const iconBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "var(--radius-sm)", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", flexShrink: 0 };
