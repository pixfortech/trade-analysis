// =====================================================================
// Strategy indicators for the real-time decision loop — PURE & deterministic.
// Connors RSI, Chandelier Exit, a Range Filter and a (simplified) HACOLT trend
// proxy. All parameters are passed in by the caller from central config; there
// are no thresholds baked in here. Return null when there is not enough data
// (never fabricate). Reuses emaSeries/round2 from technicalAnalysis.
// =====================================================================

import { emaSeries, round2, type Candle } from "./technicalAnalysis";

/* ------------------------------- helpers -------------------------------- */

/** Wilder RSI as a full series (nulls until warmed up). */
export function rsiSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : avgG === 0 ? 0 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : avgG === 0 ? 0 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

/** Consecutive up/down streak: +n up, -n down, 0 unchanged. */
export function streakSeries(closes: number[]): number[] {
  const s = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) s[i] = s[i - 1] > 0 ? s[i - 1] + 1 : 1;
    else if (closes[i] < closes[i - 1]) s[i] = s[i - 1] < 0 ? s[i - 1] - 1 : -1;
    else s[i] = 0;
  }
  return s;
}

/** True-range ATR as a full series (Wilder). */
export function atrSeries(candles: Candle[], period: number): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tr: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = candles[i].h;
    const l = candles[i].l;
    const pc = candles[i - 1].c;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr[i];
  atr /= period;
  out[period] = atr;
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}

/* ----------------------------- Connors RSI ------------------------------ */
export interface ConnorsRSIParams { rsiPeriod: number; streakRsiPeriod: number; rankPeriod: number }

/**
 * Connors RSI = mean of (short RSI, RSI of the streak, percent-rank of 1-bar ROC).
 * Range 0–100; <oversold = stretched down, >overbought = stretched up.
 */
export function connorsRSI(closes: number[], p: ConnorsRSIParams): number | null {
  const need = Math.max(p.rsiPeriod, p.streakRsiPeriod) + 2;
  if (closes.length < need || closes.length < p.rankPeriod / 2 + 2) return null;
  const i = closes.length - 1;
  const rsi = rsiSeries(closes, p.rsiPeriod);
  const streakRsi = rsiSeries(streakSeries(closes), p.streakRsiPeriod);
  const r1 = rsi[i];
  const r2 = streakRsi[i];
  if (r1 == null || r2 == null) return null;

  const roc: number[] = closes.map((c, j) => (j === 0 || closes[j - 1] === 0 ? 0 : (c / closes[j - 1] - 1) * 100));
  const start = Math.max(1, i - p.rankPeriod);
  const window = roc.slice(start, i); // strictly prior bars
  if (window.length < 1) return null;
  const cur = roc[i];
  const below = window.filter((v) => v < cur).length;
  const percentRank = (below / window.length) * 100;

  return round2((r1 + r2 + percentRank) / 3);
}

/* ---------------------------- Chandelier Exit --------------------------- */
export interface ChandelierParams { atrPeriod: number; atrMult: number; useClose: boolean }
export interface ChandelierResult { longStop: number; shortStop: number; direction: 1 | -1 }

/**
 * Chandelier Exit trailing stops + trend direction. Long stop trails up under a
 * rising trend; short stop trails down. `direction` flips only when close
 * crosses the *opposite* prior stop — used for EXIT/trailing, not entry.
 */
export function chandelierExit(candles: Candle[], p: ChandelierParams): ChandelierResult | null {
  const n = candles.length;
  if (n < p.atrPeriod + 2) return null;
  const atrs = atrSeries(candles, p.atrPeriod);

  let prevLong = -Infinity;
  let prevShort = Infinity;
  let prevDir: 1 | -1 = 1;
  let started = false;
  let result: ChandelierResult | null = null;

  for (let i = p.atrPeriod; i < n; i++) {
    const a = atrs[i];
    if (a == null) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - p.atrPeriod + 1; j <= i; j++) {
      const h = p.useClose ? candles[j].c : candles[j].h;
      const l = p.useClose ? candles[j].c : candles[j].l;
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    }
    let longStop = hi - p.atrMult * a;
    let shortStop = lo + p.atrMult * a;
    const closePrev = candles[i - 1].c;
    if (started) {
      longStop = closePrev > prevLong ? Math.max(longStop, prevLong) : longStop;
      shortStop = closePrev < prevShort ? Math.min(shortStop, prevShort) : shortStop;
    }
    let dir: 1 | -1 = prevDir;
    if (candles[i].c > prevShort) dir = 1;
    else if (candles[i].c < prevLong) dir = -1;

    prevLong = longStop;
    prevShort = shortStop;
    prevDir = dir;
    started = true;
    result = { longStop: round2(longStop), shortStop: round2(shortStop), direction: dir };
  }
  return result;
}

/* ------------------------------ Range Filter ---------------------------- */
export interface RangeFilterParams { period: number; mult: number }
export interface RangeFilterResult { dir: "bullish" | "bearish" | "neutral"; filt: number }

/** Smoothed range filter (secondary confirmation). Direction = filter slope. */
export function rangeFilter(closes: number[], p: RangeFilterParams): RangeFilterResult | null {
  if (closes.length < p.period + 2) return null;
  const absChg = closes.map((c, i) => (i === 0 ? 0 : Math.abs(c - closes[i - 1])));
  const avrng = emaSeries(absChg, p.period);
  const wper = p.period * 2 - 1;
  const scaled = avrng.map((v) => (v == null ? 0 : v * p.mult));
  const smoothrng = emaSeries(scaled, wper);

  let filt = closes[0];
  let dir = 0;
  for (let i = 1; i < closes.length; i++) {
    const r = smoothrng[i] ?? 0;
    const src = closes[i];
    const prev = filt;
    if (src > prev) filt = src - r < prev ? prev : src - r;
    else filt = src + r > prev ? prev : src + r;
    if (filt > prev) dir = 1;
    else if (filt < prev) dir = -1;
  }
  return { dir: dir > 0 ? "bullish" : dir < 0 ? "bearish" : "neutral", filt: round2(filt) };
}

/* -------------------------------- HACOLT --------------------------------- */
/** Simplified HACOLT long-term regime: Heikin-Ashi body vs a long EMA trend. */
export function hacolt(candles: Candle[], emaPeriod: number): "bullish" | "bearish" | "neutral" | null {
  if (candles.length < emaPeriod + 2) return null;
  // Heikin-Ashi last candle
  let haOpen = (candles[0].o + candles[0].c) / 2;
  let haClose = (candles[0].o + candles[0].h + candles[0].l + candles[0].c) / 4;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    haOpen = (haOpen + haClose) / 2;
    haClose = (c.o + c.h + c.l + c.c) / 4;
  }
  const closes = candles.map((c) => c.c);
  const ema = emaSeries(closes, emaPeriod);
  const e = ema[ema.length - 1];
  if (e == null) return null;
  const haBull = haClose >= haOpen;
  const trendBull = closes[closes.length - 1] >= e;
  if (haBull && trendBull) return "bullish";
  if (!haBull && !trendBull) return "bearish";
  return "neutral";
}
