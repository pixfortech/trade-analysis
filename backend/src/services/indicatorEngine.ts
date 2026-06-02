// =====================================================================
// Indicator Engine — pure, registry-based (Phase 3F, READ-ONLY)
// ---------------------------------------------------------------------
// Computes intraday indicators from OHLCV candles and exposes a registry that
// turns each ACTIVE indicator into a directional contribution (bullish /
// bearish / neutral / unavailable). Only active indicators influence the score.
//
// Pure functions only — no network, no globals, no order/execution logic.
// All outputs are analysis estimates; never guarantees.
// =====================================================================

import {
  atr,
  emaLast,
  macd as macdCalc,
  rsi as rsiCalc,
  round2,
  vwap as vwapCalc,
  type Candle,
} from "./technicalAnalysis";

export type IndicatorId =
  | "VWAP"
  | "EMA20"
  | "EMA50"
  | "RSI"
  | "MACD"
  | "ADX"
  | "ATR"
  | "SUPERTREND"
  | "VOLUME"
  | "OI";

export const DEFAULT_INDICATORS: IndicatorId[] = [
  "VWAP",
  "EMA20",
  "EMA50",
  "RSI",
  "MACD",
  "ADX",
  "ATR",
  "SUPERTREND",
  "VOLUME",
  "OI",
];

export type Direction = "bullish" | "bearish" | "neutral" | "unavailable";

export interface IndicatorContribution {
  id: IndicatorId;
  direction: Direction;
  weight: number; // points contributed to the dominant side (0 when neutral/unavailable)
  value: string; // human-readable current reading
  detail: string;
}

/** Computed indicator values for one candle series (nulls when insufficient data). */
export interface IndicatorValues {
  vwap: number | null;
  ema20: number | null;
  ema50: number | null;
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  atr: number | null;
  adx: { adx: number; plusDI: number; minusDI: number } | null;
  supertrend: { value: number; direction: "bullish" | "bearish" } | null;
  volume: { last: number; avg: number; confirmed: boolean } | null;
  oi: number | null; // open interest if provided (futures/options), else null
}

// --------------------------- indicator math ---------------------------

/** Wilder ATR series (used by ADX & Supertrend). */
function atrSeries(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const pc = candles[i - 1].c;
    tr.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - pc), Math.abs(candles[i].l - pc)));
  }
  let a = tr.slice(1, period + 1).reduce((x, y) => x + y, 0) / period;
  out[period] = a;
  for (let i = period + 1; i < candles.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

/** ADX(14) with DI+ / DI- (Wilder smoothing). */
export function adx(candles: Candle[], period = 14): { adx: number; plusDI: number; minusDI: number } | null {
  if (candles.length < period * 2 + 1) return null;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].h - candles[i - 1].h;
    const down = candles[i - 1].l - candles[i].l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    const pc = candles[i - 1].c;
    tr.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - pc), Math.abs(candles[i].l - pc)));
  }
  // Wilder smoothing
  const smooth = (arr: number[]) => {
    let s = arr.slice(1, period + 1).reduce((a, b) => a + b, 0);
    const out: number[] = new Array(arr.length).fill(0);
    out[period] = s;
    for (let i = period + 1; i < arr.length; i++) {
      s = s - s / period + arr[i];
      out[i] = s;
    }
    return out;
  };
  const trS = smooth(tr);
  const pdmS = smooth(plusDM);
  const mdmS = smooth(minusDM);
  const dx: number[] = [];
  for (let i = period; i < candles.length; i++) {
    if (trS[i] === 0) {
      dx.push(0);
      continue;
    }
    const pDI = (100 * pdmS[i]) / trS[i];
    const mDI = (100 * mdmS[i]) / trS[i];
    const sum = pDI + mDI;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / sum);
  }
  if (dx.length < period) return null;
  // ADX = Wilder-smoothed average of DX
  let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adxVal = (adxVal * (period - 1) + dx[i]) / period;
  const last = candles.length - 1;
  const plusDI = trS[last] === 0 ? 0 : (100 * pdmS[last]) / trS[last];
  const minusDI = trS[last] === 0 ? 0 : (100 * mdmS[last]) / trS[last];
  return { adx: round2(adxVal), plusDI: round2(plusDI), minusDI: round2(minusDI) };
}

/** Supertrend(period, multiplier). Returns the final band value + direction. */
export function supertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3,
): { value: number; direction: "bullish" | "bearish" } | null {
  if (candles.length < period + 1) return null;
  const atrs = atrSeries(candles, period);
  let prevUpper = Infinity;
  let prevLower = -Infinity;
  let prevSt = 0;
  let dir: "bullish" | "bearish" = "bullish";
  let started = false;
  for (let i = period; i < candles.length; i++) {
    const a = atrs[i];
    if (a == null) continue;
    const mid = (candles[i].h + candles[i].l) / 2;
    let upper = mid + multiplier * a;
    let lower = mid - multiplier * a;
    if (started) {
      upper = upper < prevUpper || candles[i - 1].c > prevUpper ? upper : prevUpper;
      lower = lower > prevLower || candles[i - 1].c < prevLower ? lower : prevLower;
    }
    if (!started) {
      dir = candles[i].c >= mid ? "bullish" : "bearish";
      prevSt = dir === "bullish" ? lower : upper;
      started = true;
    } else {
      if (prevSt === prevUpper) {
        dir = candles[i].c > upper ? "bullish" : "bearish";
      } else {
        dir = candles[i].c < lower ? "bearish" : "bullish";
      }
      prevSt = dir === "bullish" ? lower : upper;
    }
    prevUpper = upper;
    prevLower = lower;
  }
  if (!started) return null;
  return { value: round2(prevSt), direction: dir };
}

/** Central Pivot Range + classic pivots from the previous session candle. */
export function cpr(prevHigh: number, prevLow: number, prevClose: number) {
  const pivot = (prevHigh + prevLow + prevClose) / 3;
  const bc = (prevHigh + prevLow) / 2;
  const tc = pivot - bc + pivot;
  return {
    pivot: round2(pivot),
    bc: round2(Math.min(bc, tc)),
    tc: round2(Math.max(bc, tc)),
    r1: round2(2 * pivot - prevLow),
    s1: round2(2 * pivot - prevHigh),
    r2: round2(pivot + (prevHigh - prevLow)),
    s2: round2(pivot - (prevHigh - prevLow)),
  };
}

// --------------------------- compute all values ---------------------------

export function computeIndicators(candles: Candle[], oi: number | null = null): IndicatorValues {
  const closes = candles.map((c) => c.c);
  const vols = candles.map((c) => c.v);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  return {
    vwap: vwapCalc(candles),
    ema20: emaLast(closes, 20),
    ema50: emaLast(closes, 50),
    rsi: rsiCalc(closes, 14),
    macd: macdCalc(closes),
    atr: atr(candles, 14),
    adx: adx(candles, 14),
    supertrend: supertrend(candles, 10, 3),
    volume: vols.length ? { last: vols[vols.length - 1], avg: round2(avgVol), confirmed: avgVol > 0 && vols[vols.length - 1] >= avgVol } : null,
    oi,
  };
}

// --------------------------- contribution registry ---------------------------

type ContribFn = (price: number, v: IndicatorValues, ctx: { prevOi: number | null }) => IndicatorContribution;

const REGISTRY: Record<IndicatorId, ContribFn> = {
  VWAP: (price, v) => {
    if (v.vwap == null) return na("VWAP");
    const dir = price > v.vwap ? "bullish" : price < v.vwap ? "bearish" : "neutral";
    return { id: "VWAP", direction: dir, weight: dir === "neutral" ? 0 : 1, value: `${v.vwap}`, detail: `price ${price} vs VWAP ${v.vwap}` };
  },
  EMA20: (price, v) => {
    if (v.ema20 == null) return na("EMA20");
    const dir = price > v.ema20 ? "bullish" : "bearish";
    return { id: "EMA20", direction: dir, weight: 1, value: `${v.ema20}`, detail: `price ${dir === "bullish" ? ">" : "<"} EMA20 ${v.ema20}` };
  },
  EMA50: (_price, v) => {
    if (v.ema20 == null || v.ema50 == null) return na("EMA50");
    const dir = v.ema20 > v.ema50 ? "bullish" : "bearish";
    return { id: "EMA50", direction: dir, weight: 1, value: `${v.ema50}`, detail: `EMA20 ${dir === "bullish" ? ">" : "<"} EMA50` };
  },
  RSI: (_price, v) => {
    if (v.rsi == null) return na("RSI");
    const dir = v.rsi > 55 ? "bullish" : v.rsi < 45 ? "bearish" : "neutral";
    return { id: "RSI", direction: dir, weight: dir === "neutral" ? 0 : 1, value: `${v.rsi}`, detail: `RSI ${v.rsi}` };
  },
  MACD: (_price, v) => {
    if (v.macd == null) return na("MACD");
    const dir = v.macd.histogram > 0 ? "bullish" : v.macd.histogram < 0 ? "bearish" : "neutral";
    return { id: "MACD", direction: dir, weight: dir === "neutral" ? 0 : 1, value: `${v.macd.histogram}`, detail: `MACD hist ${v.macd.histogram}` };
  },
  ADX: (_price, v) => {
    if (v.adx == null) return na("ADX");
    const strong = v.adx.adx >= 20;
    const dir = !strong ? "neutral" : v.adx.plusDI > v.adx.minusDI ? "bullish" : "bearish";
    // ADX gets extra weight when the trend is strong.
    const weight = dir === "neutral" ? 0 : v.adx.adx >= 25 ? 2 : 1;
    return { id: "ADX", direction: dir, weight, value: `${v.adx.adx}`, detail: `ADX ${v.adx.adx} DI+ ${v.adx.plusDI} DI- ${v.adx.minusDI}` };
  },
  ATR: (_price, v) => {
    // ATR is directionless — informs SL/target sizing, never the score.
    return { id: "ATR", direction: "neutral", weight: 0, value: v.atr == null ? "—" : `${v.atr}`, detail: "volatility (sizing only)" };
  },
  SUPERTREND: (_price, v) => {
    if (v.supertrend == null) return na("SUPERTREND");
    return { id: "SUPERTREND", direction: v.supertrend.direction, weight: 2, value: `${v.supertrend.value}`, detail: `Supertrend ${v.supertrend.direction} @ ${v.supertrend.value}` };
  },
  VOLUME: (_price, v) => {
    if (v.volume == null) return na("VOLUME");
    // Volume confirms (adds confidence) but isn't directional on its own.
    return { id: "VOLUME", direction: "neutral", weight: 0, value: v.volume.confirmed ? "confirmed" : "low", detail: `last ${v.volume.last} vs avg ${v.volume.avg}` };
  },
  OI: (price, v, ctx) => {
    if (v.oi == null || ctx.prevOi == null) return na("OI");
    const oiUp = v.oi > ctx.prevOi;
    // price up + OI up = long build-up (bullish); price down + OI up = short build-up (bearish)
    const priceUp = price >= 0; // direction provided by caller context normally; here neutral-safe
    void priceUp;
    return { id: "OI", direction: "neutral", weight: 0, value: `${v.oi}`, detail: oiUp ? "OI rising" : "OI falling" };
  },
};

function na(id: IndicatorId): IndicatorContribution {
  return { id, direction: "unavailable", weight: 0, value: "—", detail: "insufficient data" };
}

/**
 * Build contributions for the ACTIVE indicators only. Returns the list plus the
 * aggregated bullish/bearish weights and which requested indicators were
 * unavailable (insufficient data).
 */
export function buildContributions(
  price: number,
  values: IndicatorValues,
  active: IndicatorId[],
  ctx: { prevOi: number | null } = { prevOi: null },
): { contributions: IndicatorContribution[]; bullish: number; bearish: number; missing: IndicatorId[] } {
  const contributions: IndicatorContribution[] = [];
  let bullish = 0;
  let bearish = 0;
  const missing: IndicatorId[] = [];
  for (const id of active) {
    const fn = REGISTRY[id];
    if (!fn) continue;
    const c = fn(price, values, ctx);
    contributions.push(c);
    if (c.direction === "bullish") bullish += c.weight;
    else if (c.direction === "bearish") bearish += c.weight;
    else if (c.direction === "unavailable") missing.push(id);
  }
  return { contributions, bullish, bearish, missing };
}

/** Normalise/validate an activeIndicators query value; defaults to DEFAULT_INDICATORS. */
export function parseActiveIndicators(raw: string | undefined): IndicatorId[] {
  if (!raw) return [...DEFAULT_INDICATORS];
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const valid = wanted.filter((w): w is IndicatorId => (DEFAULT_INDICATORS as string[]).includes(w));
  return valid.length ? Array.from(new Set(valid)) : [...DEFAULT_INDICATORS];
}
