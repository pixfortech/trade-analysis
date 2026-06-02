"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ChartDataResponse } from "@/types/api";

const OVERLAY_COLORS: Record<string, string> = {
  VWAP: "#f0b90b",
  EMA20: "#3b82f6",
  EMA50: "#a855f7",
  SUPERTREND: "#16c784",
};

function toTime(t: string): UTCTimestamp {
  const ms = Date.parse(t);
  return Math.floor((Number.isNaN(ms) ? Date.now() : ms) / 1000) as UTCTimestamp;
}

/**
 * Read-only candlestick chart (lightweight-charts) with active overlays
 * (VWAP/EMA/Supertrend) and optional entry/SL/target price lines.
 */
export function LiveChart({
  data,
  priceLines,
}: {
  data: ChartDataResponse;
  priceLines?: { price: number; color: string; title: string }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayRefs = useRef<Record<string, ISeriesApi<"Line">>>({});

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8", fontSize: 12 },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;
    candleRef.current = chart.addCandlestickSeries({
      upColor: "#16c784",
      downColor: "#ea3943",
      borderVisible: false,
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
    });
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      overlayRefs.current = {};
    };
  }, []);

  // Update data when it changes.
  useEffect(() => {
    const chart = chartRef.current;
    const candle = candleRef.current;
    if (!chart || !candle) return;

    candle.setData(
      data.candles.map((c) => ({ time: toTime(c.t), open: c.o, high: c.h, low: c.l, close: c.c })),
    );

    // Sync overlay line series with the active overlays in the payload.
    const wanted = new Set(Object.keys(data.overlays));
    // remove stale overlays
    for (const key of Object.keys(overlayRefs.current)) {
      if (!wanted.has(key)) {
        chart.removeSeries(overlayRefs.current[key]);
        delete overlayRefs.current[key];
      }
    }
    for (const [key, points] of Object.entries(data.overlays)) {
      let series = overlayRefs.current[key];
      if (!series) {
        series = chart.addLineSeries({ color: OVERLAY_COLORS[key] ?? "#64748b", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        overlayRefs.current[key] = series;
      }
      series.setData(points.map((p) => ({ time: toTime(p.t), value: p.v })));
    }

    // Reset + apply price lines (entry/SL/targets) on the candle series.
    // (Recreate the candle series' price lines by clearing via a fresh set.)
    chart.timeScale().fitContent();
  }, [data]);

  // Apply entry/SL/target price lines.
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    const created = (priceLines ?? []).map((pl) =>
      candle.createPriceLine({ price: pl.price, color: pl.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: pl.title }),
    );
    return () => {
      for (const line of created) {
        try {
          candle.removePriceLine(line);
        } catch {
          /* series may be gone */
        }
      }
    };
  }, [priceLines, data]);

  return <div ref={containerRef} className="h-72 w-full sm:h-80" />;
}
