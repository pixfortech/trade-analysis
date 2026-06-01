// =====================================================================
// Technical Analysis — pure, dependency-free, deterministic (Phase 3B)
// ---------------------------------------------------------------------
// READ-ONLY analysis helpers. Given a live quote and (optionally) historical
// candles, produce indicators, support/resistance, and long/short trade plans
// with entry, stop-loss, targets and risk-reward.
//
// NOTHING here places, modifies or cancels orders. This is analysis only and
// must always be presented with the risk disclaimer. No profit is guaranteed.
// All functions are pure (no network, no globals) so they are easy to test.
// =====================================================================

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type RiskProfile = "conservative" | "balanced" | "aggressive";
export type DataQuality = "live-historical" | "live-quote-only";
export type TrendDirection = "bullish" | "bearish" | "sideways";
export type TrendStrength = "weak" | "medium" | "strong";
export type Confidence = "low" | "medium" | "high";
export type Action = "LONG" | "SHORT" | "WAIT" | "AVOID" | "RANGE-BOUND";

export const RISK_DISCLAIMER =
  "This is AI-based read-only market analysis, not guaranteed profit advice. " +
  "Markets are risky; use a strict stop-loss and consult a SEBI-registered financial adviser before trading.";

export interface QuoteSnapshot {
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
}

export interface BuildInput {
  instrument: string;
  quote: QuoteSnapshot;
  candles: Candle[] | null;
  riskProfile: RiskProfile;
  timestamp: string;
}

interface Plan {
  entryAbove?: number;
  entryBelow?: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: string;
  condition: string;
}

export interface LiveTradePlanResult {
  instrument: string;
  source: "kite";
  live: true;
  readOnly: true;
  timestamp: string;
  dataQuality: DataQuality;
  dataNote: string;
  currentPrice: number;
  previousClose: number;
  marketData: { open: number; high: number; low: number; close: number; volume: number };
  indicators: {
    ema9: number | null;
    ema20: number | null;
    vwap: number | null;
    rsi: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    atr: number | null;
    volumeConfirmed: boolean | null;
  };
  trend: { direction: TrendDirection; strength: TrendStrength; reason: string };
  levels: { support1: number; support2: number; resistance1: number; resistance2: number };
  longPlan: Plan;
  shortPlan: Plan;
  finalDecision: { action: Action; confidence: Confidence; reason: string };
  riskDisclaimer: string;
}

// --------------------------- helpers ---------------------------
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Exponential moving average series; entries before the seed index are null. */
function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function emaLast(values: number[], period: number): number | null {
  const s = emaSeries(values, period);
  const v = s[s.length - 1];
  return v == null ? null : round2(v);
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return round2(100 - 100 / (1 + rs));
}

function macd(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 26 + 9) return null;
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (e12[i] != null && e26[i] != null) macdLine.push((e12[i] as number) - (e26[i] as number));
  }
  const sig = emaSeries(macdLine, 9);
  const m = macdLine[macdLine.length - 1];
  const s = sig[sig.length - 1];
  if (m == null || s == null) return null;
  return { macd: round2(m), signal: round2(s), histogram: round2(m - s) };
}

function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { h, l } = candles[i];
    const pc = candles[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return round2(a);
}

function vwap(candles: Candle[]): number | null {
  if (!candles.length) return null;
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    pv += ((c.h + c.l + c.c) / 3) * c.v;
    vol += c.v;
  }
  if (vol <= 0) return null;
  return round2(pv / vol);
}

/** Floor pivots from a reference High/Low/Close (recent swing extremes + current price). */
function pivotLevels(high: number, low: number, close: number) {
  const p = (high + low + close) / 3;
  return {
    resistance1: round2(2 * p - low),
    support1: round2(2 * p - high),
    resistance2: round2(p + (high - low)),
    support2: round2(p - (high - low)),
  };
}

const PROFILE: Record<RiskProfile, { slMult: number; targets: [number, number, number] }> = {
  conservative: { slMult: 1.5, targets: [1, 2, 3] },
  balanced: { slMult: 1.0, targets: [1, 2, 3] },
  aggressive: { slMult: 0.75, targets: [1.5, 3, 4.5] },
};

// --------------------------- main builder ---------------------------
export function buildLiveTradePlan(input: BuildInput): LiveTradePlanResult {
  const { instrument, quote, candles, riskProfile, timestamp } = input;
  const hasCandles = Array.isArray(candles) && candles.length >= 15;
  const dataQuality: DataQuality = hasCandles ? "live-historical" : "live-quote-only";

  const price = round2(quote.lastPrice);
  const closes = hasCandles ? (candles as Candle[]).map((c) => c.c) : [];

  // --- Indicators (null when not enough data) ---
  const ema9 = hasCandles ? emaLast(closes, 9) : null;
  const ema20 = hasCandles ? emaLast(closes, 20) : null;
  const rsiVal = hasCandles ? rsi(closes) : null;
  const macdVal = hasCandles ? macd(closes) : null;
  const atrVal = hasCandles ? atr(candles as Candle[]) : null;
  const vwapVal = hasCandles ? vwap(candles as Candle[]) : null;

  let volumeConfirmed: boolean | null = null;
  if (hasCandles) {
    const vols = (candles as Candle[]).map((c) => c.v);
    const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
    volumeConfirmed = avg > 0 ? vols[vols.length - 1] >= avg : null;
  }

  // --- Support / resistance from recent swing extremes (or today's range) ---
  const refHigh = hasCandles ? Math.max(...(candles as Candle[]).slice(-30).map((c) => c.h)) : quote.high;
  const refLow = hasCandles ? Math.min(...(candles as Candle[]).slice(-30).map((c) => c.l)) : quote.low;
  const levels = pivotLevels(refHigh, refLow, price);

  // --- Volatility unit for stop distance ---
  const dayRange = Math.max(quote.high - quote.low, 0);
  const volUnit = atrVal && atrVal > 0 ? atrVal : dayRange > 0 ? dayRange * 0.5 : 0;
  const degenerate = volUnit <= 0 || refHigh <= refLow;

  const { slMult, targets } = PROFILE[riskProfile];
  const slDistance = round2(volUnit * slMult);

  // --- Long plan (breakout above nearest unbroken resistance) ---
  const longEntry =
    price < levels.resistance1 ? levels.resistance1 : price < levels.resistance2 ? levels.resistance2 : price;
  const longSL = round2(longEntry - slDistance);
  const longR = Math.max(longEntry - longSL, 0);
  const longPlan: Plan = {
    entryAbove: round2(longEntry),
    stopLoss: longSL,
    target1: round2(longEntry + longR * targets[0]),
    target2: round2(longEntry + longR * targets[1]),
    target3: round2(longEntry + longR * targets[2]),
    riskReward: `1:${targets[1]}`,
    condition: `Enter long on a sustained breakout above ${round2(longEntry)} with volume confirmation; invalidated below ${longSL}.`,
  };

  // --- Short plan (breakdown below nearest unbroken support) ---
  const shortEntry =
    price > levels.support1 ? levels.support1 : price > levels.support2 ? levels.support2 : price;
  const shortSL = round2(shortEntry + slDistance);
  const shortR = Math.max(shortSL - shortEntry, 0);
  const shortPlan: Plan = {
    entryBelow: round2(shortEntry),
    stopLoss: shortSL,
    target1: round2(shortEntry - shortR * targets[0]),
    target2: round2(shortEntry - shortR * targets[1]),
    target3: round2(shortEntry - shortR * targets[2]),
    riskReward: `1:${targets[1]}`,
    condition: `Enter short on a sustained breakdown below ${round2(shortEntry)} with volume confirmation; invalidated above ${shortSL}.`,
  };

  // --- Trend scoring (only count signals we actually have) ---
  const reasons: string[] = [];
  let bull = 0;
  let bear = 0;
  if (ema9 != null) {
    if (price > ema9) (bull++, reasons.push("price > EMA9"));
    else (bear++, reasons.push("price < EMA9"));
  }
  if (ema9 != null && ema20 != null) {
    if (ema9 > ema20) (bull++, reasons.push("EMA9 > EMA20"));
    else (bear++, reasons.push("EMA9 < EMA20"));
  }
  if (vwapVal != null) {
    if (price > vwapVal) (bull++, reasons.push("price > VWAP"));
    else (bear++, reasons.push("price < VWAP"));
  }
  if (rsiVal != null) {
    if (rsiVal > 55) (bull++, reasons.push(`RSI ${rsiVal} (>55)`));
    else if (rsiVal < 45) (bear++, reasons.push(`RSI ${rsiVal} (<45)`));
    else reasons.push(`RSI ${rsiVal} (neutral)`);
  }
  if (macdVal != null) {
    if (macdVal.histogram > 0) (bull++, reasons.push("MACD histogram > 0"));
    else if (macdVal.histogram < 0) (bear++, reasons.push("MACD histogram < 0"));
  }
  if (price > quote.previousClose) (bull++, reasons.push("price > previous close"));
  else if (price < quote.previousClose) (bear++, reasons.push("price < previous close"));

  const net = bull - bear;
  const direction: TrendDirection = net >= 2 ? "bullish" : net <= -2 ? "bearish" : "sideways";
  const magnitude = Math.abs(net);
  // Quote-only data can never claim better than "weak".
  let strength: TrendStrength =
    !hasCandles ? "weak" : magnitude >= 3 ? "strong" : magnitude >= 2 ? "medium" : "weak";

  // --- Final decision ---
  let action: Action;
  let confidence: Confidence;
  let decisionReason: string;

  if (degenerate) {
    action = "AVOID";
    confidence = "low";
    decisionReason = "Insufficient or degenerate price data (no usable range). Avoid acting on this read.";
  } else if (direction === "bullish" && strength !== "weak") {
    action = "LONG";
    confidence = strength === "strong" ? "high" : "medium";
    decisionReason = `Bullish alignment (${reasons.join(", ")}). Prefer longs on a breakout above ${longPlan.entryAbove}.`;
  } else if (direction === "bearish" && strength !== "weak") {
    action = "SHORT";
    confidence = strength === "strong" ? "high" : "medium";
    decisionReason = `Bearish alignment (${reasons.join(", ")}). Prefer shorts on a breakdown below ${shortPlan.entryBelow}.`;
  } else if (direction === "sideways" && hasCandles) {
    action = "RANGE-BOUND";
    confidence = "low";
    decisionReason = `Mixed signals (${reasons.join(", ") || "no strong bias"}). Price is range-bound between ${levels.support1} and ${levels.resistance1}; wait for a clean break.`;
  } else {
    action = "WAIT";
    confidence = "low";
    decisionReason = hasCandles
      ? `No decisive edge yet (${reasons.join(", ") || "weak signals"}). Wait for confirmation.`
      : "Only live quote OHLC is available (no candle history). Confidence is low — wait for confirmation from intraday candles.";
  }

  // Quote-only never returns "high" confidence.
  if (!hasCandles && confidence === "high") confidence = "medium";

  const trendReason =
    reasons.length > 0
      ? `${reasons.join(", ")}.`
      : "Not enough indicator data; using live quote OHLC only.";

  return {
    instrument,
    source: "kite",
    live: true,
    readOnly: true,
    timestamp,
    dataQuality,
    dataNote: hasCandles
      ? "Based on live Kite quote + historical candles."
      : "Based on live Kite quote OHLC only (historical candles unavailable) — lower confidence.",
    currentPrice: price,
    previousClose: round2(quote.previousClose),
    marketData: {
      open: round2(quote.open),
      high: round2(quote.high),
      low: round2(quote.low),
      close: round2(quote.previousClose),
      volume: quote.volume,
    },
    indicators: {
      ema9,
      ema20,
      vwap: vwapVal,
      rsi: rsiVal,
      macd: macdVal,
      atr: atrVal,
      volumeConfirmed,
    },
    trend: { direction, strength, reason: trendReason },
    levels,
    longPlan,
    shortPlan,
    finalDecision: { action, confidence, reason: decisionReason },
    riskDisclaimer: RISK_DISCLAIMER,
  };
}
