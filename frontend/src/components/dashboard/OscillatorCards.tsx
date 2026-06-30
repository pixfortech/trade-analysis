"use client";

import { Sparkline } from "@/components/ui/Sparkline";
import { INDICATOR_DEFS, computeIndicator, instanceLabel, type IndicatorInstance } from "@/lib/chartIndicators";
import type { Candle } from "@/lib/indicators";

const TONE: Record<"bull" | "bear" | "neutral", string> = {
  bull: "var(--action-enter)",
  bear: "var(--action-exit)",
  neutral: "var(--ink-2)",
};

/**
 * Compact readout cards for oscillator indicators (RSI / MACD / Stochastic /
 * ATR / ADX) computed from our Kite candles. A lightweight stand-in for true
 * lower panes — latest value + a sparkline of the recent series.
 */
export function OscillatorCards({ candles, indicators }: { candles: Candle[]; indicators: IndicatorInstance[] }) {
  const lower = indicators.filter((i) => i.enabled && INDICATOR_DEFS[i.type].pane === "lower");
  if (lower.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
      {lower.map((inst) => {
        const r = computeIndicator(inst, candles);
        const ro = r.readouts[0];
        const spark = (r.lines[0]?.values ?? []).filter((v): v is number => v != null).slice(-48);
        const tone = ro?.tone ?? "neutral";
        return (
          <div key={inst.id} style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: "8px 10px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <span className="eyebrow" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{instanceLabel(inst)}</span>
              {!r.insufficient && spark.length >= 2 && <Sparkline data={spark} positive={tone !== "bear"} width={64} height={20} />}
            </div>
            {r.insufficient ? (
              <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>insufficient candle data</div>
            ) : (
              <div className="num" style={{ fontSize: 16, fontWeight: 700, color: TONE[tone], lineHeight: 1.1, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ro?.value ?? "—"}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
