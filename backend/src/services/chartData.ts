// =====================================================================
// Chart Data builder — pure, READ-ONLY (Phase 3F)
// ---------------------------------------------------------------------
// Turns OHLCV candles + active indicators into chart-ready series: candles,
// overlay series (VWAP / EMA20 / EMA50 / Supertrend) and oscillator series
// (RSI / MACD / ADX / Volume), plus key levels (CPR/pivots, prev day H/L/C).
// Pure — no network, no globals, no order/execution logic.
// =====================================================================

import { emaSeries, round2, type Candle } from "./technicalAnalysis";
import { cpr, supertrend, type IndicatorId } from "./indicatorEngine";

export interface ChartPoint {
  t: string;
  v: number;
}
export interface ChartData {
  candles: { t: string; o: number; h: number; l: number; c: number; v: number }[];
  activeIndicators: IndicatorId[];
  overlays: Record<string, ChartPoint[]>; // e.g. VWAP, EMA20, EMA50, SUPERTREND
  oscillators: Record<string, ChartPoint[]>; // e.g. RSI, MACD_HIST, ADX, VOLUME
  levels: {
    pivot: number | null;
    bc: number | null;
    tc: number | null;
    r1: number | null;
    s1: number | null;
    prevHigh: number | null;
    prevLow: number | null;
    prevClose: number | null;
  };
  lastUpdated: string;
}

/** Rolling VWAP series across the provided candles. */
function vwapSeries(candles: Candle[]): ChartPoint[] {
  const out: ChartPoint[] = [];
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    pv += ((c.h + c.l + c.c) / 3) * c.v;
    vol += c.v;
    out.push({ t: c.t, v: vol > 0 ? round2(pv / vol) : c.c });
  }
  return out;
}

function emaPoints(candles: Candle[], period: number): ChartPoint[] {
  const s = emaSeries(candles.map((c) => c.c), period);
  const out: ChartPoint[] = [];
  for (let i = 0; i < candles.length; i++) if (s[i] != null) out.push({ t: candles[i].t, v: round2(s[i] as number) });
  return out;
}

/** Per-candle Supertrend line (recomputed on expanding windows; fine for chart sizes). */
function supertrendPoints(candles: Candle[]): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (let i = 20; i < candles.length; i++) {
    const st = supertrend(candles.slice(0, i + 1), 10, 3);
    if (st) out.push({ t: candles[i].t, v: st.value });
  }
  return out;
}

function rsiPoints(candles: Candle[], period = 14): ChartPoint[] {
  const closes = candles.map((c) => c.c);
  const out: ChartPoint[] = [];
  if (closes.length < period + 1) return out;
  let avgG = 0;
  let avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgG += d;
    else avgL -= d;
  }
  avgG /= period;
  avgL /= period;
  const rsiAt = () => (avgL === 0 ? 100 : round2(100 - 100 / (1 + avgG / avgL)));
  out.push({ t: candles[period].t, v: rsiAt() });
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out.push({ t: candles[i].t, v: rsiAt() });
  }
  return out;
}

function macdHistPoints(candles: Candle[]): ChartPoint[] {
  const closes = candles.map((c) => c.c);
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const macdLine: { i: number; v: number }[] = [];
  for (let i = 0; i < closes.length; i++) if (e12[i] != null && e26[i] != null) macdLine.push({ i, v: (e12[i] as number) - (e26[i] as number) });
  const sig = emaSeries(macdLine.map((m) => m.v), 9);
  const out: ChartPoint[] = [];
  for (let k = 0; k < macdLine.length; k++) if (sig[k] != null) out.push({ t: candles[macdLine[k].i].t, v: round2(macdLine[k].v - (sig[k] as number)) });
  return out;
}

function volumePoints(candles: Candle[]): ChartPoint[] {
  return candles.map((c) => ({ t: c.t, v: c.v }));
}

/**
 * Build chart data for the active indicators. `prevDay` carries previous-session
 * H/L/C for CPR/pivots & major levels (optional).
 */
export function buildChartData(
  candles: Candle[],
  active: IndicatorId[],
  prevDay: { high: number; low: number; close: number } | null,
  lastUpdated: string,
): ChartData {
  const has = (id: IndicatorId) => active.includes(id);
  const overlays: Record<string, ChartPoint[]> = {};
  const oscillators: Record<string, ChartPoint[]> = {};

  if (has("VWAP")) overlays.VWAP = vwapSeries(candles);
  if (has("EMA20")) overlays.EMA20 = emaPoints(candles, 20);
  if (has("EMA50")) overlays.EMA50 = emaPoints(candles, 50);
  if (has("SUPERTREND")) overlays.SUPERTREND = supertrendPoints(candles);

  if (has("RSI")) oscillators.RSI = rsiPoints(candles);
  if (has("MACD")) oscillators.MACD_HIST = macdHistPoints(candles);
  if (has("VOLUME")) oscillators.VOLUME = volumePoints(candles);

  const levels = prevDay
    ? { ...cpr(prevDay.high, prevDay.low, prevDay.close), prevHigh: round2(prevDay.high), prevLow: round2(prevDay.low), prevClose: round2(prevDay.close) }
    : { pivot: null, bc: null, tc: null, r1: null, s1: null, prevHigh: null, prevLow: null, prevClose: null };

  return {
    candles: candles.map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })),
    activeIndicators: active,
    overlays,
    oscillators,
    levels: {
      pivot: "pivot" in levels ? (levels.pivot as number | null) : null,
      bc: "bc" in levels ? (levels.bc as number | null) : null,
      tc: "tc" in levels ? (levels.tc as number | null) : null,
      r1: "r1" in levels ? (levels.r1 as number | null) : null,
      s1: "s1" in levels ? (levels.s1 as number | null) : null,
      prevHigh: levels.prevHigh,
      prevLow: levels.prevLow,
      prevClose: levels.prevClose,
    },
    lastUpdated,
  };
}
