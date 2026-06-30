"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ChartDataResponse } from "@/types/api";
import type { Candle } from "@/lib/indicators";
import { computeIndicator, type IndicatorInstance } from "@/lib/chartIndicators";

function toTime(t: string): UTCTimestamp {
  const ms = Date.parse(t);
  return Math.floor((Number.isNaN(ms) ? Date.now() : ms) / 1000) as UTCTimestamp;
}

type AnySeries = { kind: "line"; api: ISeriesApi<"Line"> } | { kind: "hist"; api: ISeriesApi<"Histogram"> };

/**
 * Read-only candlestick chart (lightweight-charts) with NATIVE indicator
 * overlays computed from our Kite candles (EMA/SMA/WMA/VWAP/Bollinger/Supertrend
 * + a volume band), plus the locked entry/SL/target price lines. Oscillators
 * (RSI/MACD/etc.) render as readout cards below, not here.
 */
export function LiveChart({
  data,
  priceLines,
  indicators,
  theme = "dark",
}: {
  data: ChartDataResponse;
  priceLines?: { price: number; color: string; title: string }[];
  indicators?: IndicatorInstance[];
  theme?: "dark" | "light";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const seriesRef = useRef<Map<string, AnySeries>>(new Map());
  const volScaleSet = useRef(false);
  const lastStartRef = useRef<number | null>(null);

  const chartInst = useMemo(() => (indicators ?? []).filter((i) => i.enabled), [indicators]);
  const sig = useMemo(() => JSON.stringify(chartInst.map((i) => [i.id, i.color, i.params])), [chartInst]);

  // (A) create / recreate chart on theme change.
  useEffect(() => {
    if (!containerRef.current) return;
    const text = theme === "light" ? "#5d6b82" : "#8b97ab";
    const grid = theme === "light" ? "rgba(12,17,29,0.06)" : "rgba(255,255,255,0.05)";
    const border = theme === "light" ? "rgba(12,17,29,0.12)" : "rgba(255,255,255,0.1)";
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontSize: 11 },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;
    candleRef.current = chart.addCandlestickSeries({ upColor: "#12b76a", downColor: "#f04438", borderVisible: false, wickUpColor: "#12b76a", wickDownColor: "#f04438" });
    seriesRef.current = new Map();
    volScaleSet.current = false;
    lastStartRef.current = null;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      seriesRef.current = new Map();
    };
  }, [theme]);

  // (B) reconcile overlay/volume series + push data. Runs on data ticks too
  // (cheap: same config = no add/remove, just setData; no zoom reset).
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;
    const candles = data.candles as Candle[];

    candle.setData(candles.map((c) => ({ time: toTime(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));

    interface Spec { key: string; kind: "line" | "hist"; color: string; vol: boolean; values: (number | null)[]; barColors?: string[] }
    const specs: Spec[] = [];
    for (const inst of chartInst) {
      const r = computeIndicator(inst, candles);
      if (r.pane === "lower") continue; // oscillators → readout cards
      const vol = r.pane === "volume";
      for (const line of r.lines) specs.push({ key: `${inst.id}#${line.name}`, kind: "line", color: line.color, vol, values: line.values });
      if (r.hist) {
        const barColors = candles.map((c) => (c.c >= c.o ? "rgba(18,183,106,0.5)" : "rgba(240,68,56,0.5)"));
        specs.push({ key: `${inst.id}#${r.hist.name}`, kind: "hist", color: "#888", vol, values: r.hist.values, barColors });
      }
    }

    const desired = new Set(specs.map((s) => s.key));
    for (const [key, s] of seriesRef.current) {
      if (!desired.has(key)) { chart.removeSeries(s.api); seriesRef.current.delete(key); }
    }
    for (const spec of specs) {
      let entry = seriesRef.current.get(spec.key);
      if (!entry) {
        if (spec.kind === "line") {
          entry = { kind: "line", api: chart.addLineSeries({ color: spec.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceScaleId: spec.vol ? "vol" : "right" }) };
        } else {
          entry = { kind: "hist", api: chart.addHistogramSeries({ priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false }) };
        }
        seriesRef.current.set(spec.key, entry);
        if (spec.vol && !volScaleSet.current) {
          chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
          volScaleSet.current = true;
        }
      } else if (entry.kind === "line") {
        entry.api.applyOptions({ color: spec.color });
      }
      if (entry.kind === "line") {
        const pts: { time: UTCTimestamp; value: number }[] = [];
        for (let i = 0; i < candles.length; i++) if (spec.values[i] != null) pts.push({ time: toTime(candles[i].t), value: spec.values[i] as number });
        entry.api.setData(pts);
      } else {
        entry.api.setData(candles.map((c, i) => ({ time: toTime(c.t), value: spec.values[i] ?? 0, color: spec.barColors?.[i] })));
      }
    }

    const start = candles.length ? toTime(candles[0].t) : null;
    if (start !== lastStartRef.current) { chart.timeScale().fitContent(); lastStartRef.current = start; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sig, theme]);

  // (C) entry/SL/target price lines.
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    const created = (priceLines ?? []).map((pl) => candle.createPriceLine({ price: pl.price, color: pl.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: pl.title }));
    return () => {
      for (const line of created) {
        try { candle.removePriceLine(line); } catch { /* series may be gone */ }
      }
    };
  }, [priceLines, data, theme]);

  return <div ref={containerRef} className="h-72 w-full sm:h-80" />;
}
