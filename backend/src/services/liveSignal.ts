// =====================================================================
// Live Signal Engine — pure, deterministic (Phase 3E, READ-ONLY)
// ---------------------------------------------------------------------
// Given a live quote + (optional) historical candles, produce a practical
// market signal: trend, bullish/bearish probability, estimated win %, long &
// short setups (entry/SL/targets/exits), risk-reward and *tentative* P/L per
// lot. Reuses the indicator helpers from technicalAnalysis.ts.
//
// READ-ONLY analysis only — NO order placement/modification/cancellation, no
// GTT/baskets, no execution. All probabilities and P/L figures are ESTIMATES,
// never guarantees; the disclaimer is always attached.
// =====================================================================

import {
  atr,
  emaLast,
  macd,
  pivotLevels,
  round2,
  rsi,
  vwap,
  type Candle,
  type RiskProfile,
} from "./technicalAnalysis";

export const SIGNAL_DISCLAIMER =
  "This is read-only AI-based market analysis using live data. Probabilities, " +
  "profit/loss and levels are ESTIMATES, not guaranteed returns. Markets are " +
  "risky — use strict risk management and consult a SEBI-registered adviser.";

export type SignalAction = "LONG" | "SHORT" | "WAIT" | "AVOID";
export type SetupStatus = "active" | "wait" | "avoid";
export type Confidence = "low" | "medium" | "high";
export type SignalDataQuality = "quote-only" | "candle-backed" | "strong";

export interface SignalInput {
  instrument: string;
  quote: {
    lastPrice: number;
    open: number;
    high: number;
    low: number;
    previousClose: number;
    volume: number;
  };
  candles: Candle[] | null;
  riskProfile: RiskProfile;
  lotSize: number | null;
  timestamp: string;
}

interface Setup {
  status: SetupStatus;
  entryAbove?: number;
  entryBelow?: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  partialExit: number;
  fullExit: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  riskReward: string;
  estimatedProfitForOneLot: number;
  estimatedLossForOneLot: number;
  condition: string;
}

export interface LiveSignalResult {
  instrument: string;
  source: "kite";
  live: true;
  readOnly: true;
  timestamp: string;
  currentPrice: number;
  marketData: {
    open: number;
    high: number;
    low: number;
    previousClose: number;
    volume: number;
    vwap: number | null;
  };
  indicators: {
    ema9: number | null;
    ema20: number | null;
    rsi: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    atr: number | null;
    volumeConfirmed: boolean | null;
  };
  trend: { direction: "bullish" | "bearish" | "sideways"; strength: "weak" | "moderate" | "strong"; score: number; reason: string };
  probability: {
    bullishPercent: number;
    bearishPercent: number;
    estimatedWinPercent: number;
    confidence: Confidence;
    dataQuality: SignalDataQuality;
  };
  levels: { support1: number; support2: number; resistance1: number; resistance2: number; noTradeZone: string };
  longSetup: Setup;
  shortSetup: Setup;
  finalDecision: {
    action: SignalAction;
    reason: string;
    preferredSetup: "long" | "short" | "none";
    invalidationLevel: number;
  };
  disclaimer: string;
}

const PROFILE: Record<RiskProfile, { slMult: number; targets: [number, number, number] }> = {
  conservative: { slMult: 1.5, targets: [1, 2, 3] },
  balanced: { slMult: 1.0, targets: [1, 2, 3] },
  aggressive: { slMult: 0.75, targets: [1.5, 3, 4.5] },
};

/** Build the live signal. Pure — no network, no globals. */
export function buildLiveSignal(input: SignalInput): LiveSignalResult {
  const { instrument, quote, candles, riskProfile, lotSize, timestamp } = input;
  const hasCandles = Array.isArray(candles) && candles.length >= 20;
  const closes = hasCandles ? (candles as Candle[]).map((c) => c.c) : [];

  const price = round2(quote.lastPrice);

  // --- Indicators ---
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

  // --- Support / resistance ---
  const refHigh = hasCandles ? Math.max(...(candles as Candle[]).slice(-30).map((c) => c.h)) : quote.high;
  const refLow = hasCandles ? Math.min(...(candles as Candle[]).slice(-30).map((c) => c.l)) : quote.low;
  const levels = pivotLevels(refHigh, refLow, price);

  // --- Volatility unit ---
  const dayRange = Math.max(quote.high - quote.low, 0);
  const volUnit = atrVal && atrVal > 0 ? atrVal : dayRange > 0 ? dayRange * 0.5 : 0;
  const degenerate = volUnit <= 0 || refHigh <= refLow;

  // --- Trend scoring (count only available signals) ---
  const reasons: string[] = [];
  let bull = 0;
  let bear = 0;
  let signalsCounted = 0;
  const add = (cond: boolean, bullSide: boolean, why: string) => {
    if (!cond) return;
    signalsCounted++;
    if (bullSide) bull++;
    else bear++;
    reasons.push(why);
  };
  if (ema9 != null && ema20 != null) {
    add(ema9 > ema20, true, "EMA9 > EMA20");
    add(ema9 < ema20, false, "EMA9 < EMA20");
  }
  if (ema9 != null) {
    add(price > ema9, true, "price > EMA9");
    add(price < ema9, false, "price < EMA9");
  }
  if (rsiVal != null) {
    add(rsiVal > 55, true, `RSI ${rsiVal} (>55)`);
    add(rsiVal < 45, false, `RSI ${rsiVal} (<45)`);
  }
  if (macdVal != null) {
    add(macdVal.histogram > 0, true, "MACD histogram > 0");
    add(macdVal.histogram < 0, false, "MACD histogram < 0");
  }
  if (vwapVal != null) {
    add(price > vwapVal, true, "price > VWAP");
    add(price < vwapVal, false, "price < VWAP");
  }
  add(price > levels.resistance1, true, "price broke resistance1");
  add(price < levels.support1, false, "price broke support1");
  add(price > quote.previousClose, true, "price > previous close");
  add(price < quote.previousClose, false, "price < previous close");

  const net = bull - bear;
  const direction = net >= 2 ? "bullish" : net <= -2 ? "bearish" : "sideways";
  const magnitude = Math.abs(net);

  // --- Probability (bullish + bearish ≈ 100) ---
  // Base 50/50, nudged by net agreement among counted signals.
  const totalDirectional = bull + bear;
  let bullishPercent: number;
  if (totalDirectional === 0) {
    bullishPercent = 50;
  } else {
    // Weight by agreement; clamp so quote-only stays near neutral.
    const lean = (net / Math.max(totalDirectional, 1)) * 45; // ±45 max
    bullishPercent = clamp(round2(50 + lean), 5, 95);
  }
  const bearishPercent = round2(100 - bullishPercent);

  // --- Confidence / data quality ---
  let dataQuality: SignalDataQuality;
  if (!hasCandles) dataQuality = "quote-only";
  else if (signalsCounted >= 6 && volumeConfirmed) dataQuality = "strong";
  else dataQuality = "candle-backed";

  let confidence: Confidence;
  if (!hasCandles || degenerate) confidence = "low";
  else if (magnitude >= 4 && (dataQuality === "strong" || volumeConfirmed)) confidence = "high";
  else if (magnitude >= 2) confidence = "medium";
  else confidence = "low";

  const strength: "weak" | "moderate" | "strong" =
    !hasCandles ? "weak" : magnitude >= 4 ? "strong" : magnitude >= 2 ? "moderate" : "weak";

  // --- Estimated win % (conservative, capped) ---
  // Start from the dominant-side probability, discount for low confidence /
  // weak data / conflicting signals; cap at 75 unless everything aligns.
  const dominant = Math.max(bullishPercent, bearishPercent);
  let estimatedWinPercent = dominant;
  if (!hasCandles) estimatedWinPercent = Math.min(estimatedWinPercent, 45);
  if (confidence === "low") estimatedWinPercent = Math.min(estimatedWinPercent, 50);
  else if (confidence === "medium") estimatedWinPercent = Math.min(estimatedWinPercent, 65);
  // Only allow >75 when strong data + strong trend + volume confirmation.
  const allAligned = dataQuality === "strong" && strength === "strong" && volumeConfirmed === true;
  estimatedWinPercent = Math.min(estimatedWinPercent, allAligned ? 80 : 75);
  estimatedWinPercent = round2(clamp(estimatedWinPercent, 20, 80));

  // --- Setups ---
  const { slMult, targets } = PROFILE[riskProfile];
  const slDistance = round2(volUnit * slMult);
  const lot = lotSize && lotSize > 0 ? lotSize : 1;

  const longEntry =
    price < levels.resistance1 ? levels.resistance1 : price < levels.resistance2 ? levels.resistance2 : round2(price + volUnit * 0.25);
  const longSetup = makeSetup({
    side: "long",
    entry: longEntry,
    slDistance,
    targets,
    lot,
    enabled: !degenerate,
    active: direction === "bullish" && confidence !== "low",
  });

  const shortEntry =
    price > levels.support1 ? levels.support1 : price > levels.support2 ? levels.support2 : round2(price - volUnit * 0.25);
  const shortSetup = makeSetup({
    side: "short",
    entry: shortEntry,
    slDistance,
    targets,
    lot,
    enabled: !degenerate,
    active: direction === "bearish" && confidence !== "low",
  });

  // --- Final decision ---
  let action: SignalAction;
  let preferredSetup: "long" | "short" | "none";
  let reason: string;
  if (degenerate || dataQuality === "quote-only") {
    action = degenerate ? "AVOID" : "WAIT";
    preferredSetup = "none";
    reason = degenerate
      ? "Insufficient/degenerate price data (no usable range). Avoid acting on this read."
      : "Only live quote data is available (no candle history). Confidence is low — wait for candle confirmation.";
  } else if (direction === "bullish" && confidence !== "low") {
    action = "LONG";
    preferredSetup = "long";
    reason = `Bullish alignment (${reasons.join(", ")}). Prefer longs above ${longSetup.entryAbove}.`;
  } else if (direction === "bearish" && confidence !== "low") {
    action = "SHORT";
    preferredSetup = "short";
    reason = `Bearish alignment (${reasons.join(", ")}). Prefer shorts below ${shortSetup.entryBelow}.`;
  } else {
    action = "WAIT";
    preferredSetup = "none";
    reason = `No decisive edge yet (${reasons.join(", ") || "weak/conflicting signals"}). Wait for a clean break of ${levels.support1}–${levels.resistance1}.`;
  }

  const invalidationLevel = action === "LONG" ? longSetup.stopLoss : action === "SHORT" ? shortSetup.stopLoss : round2(price);

  return {
    instrument,
    source: "kite",
    live: true,
    readOnly: true,
    timestamp,
    currentPrice: price,
    marketData: {
      open: round2(quote.open),
      high: round2(quote.high),
      low: round2(quote.low),
      previousClose: round2(quote.previousClose),
      volume: quote.volume,
      vwap: vwapVal,
    },
    indicators: { ema9, ema20, rsi: rsiVal, macd: macdVal, atr: atrVal, volumeConfirmed },
    trend: {
      direction,
      strength,
      score: net,
      reason: reasons.length ? `${reasons.join(", ")}.` : "Not enough indicator data; using live quote only.",
    },
    probability: { bullishPercent, bearishPercent, estimatedWinPercent, confidence, dataQuality },
    levels: {
      ...levels,
      noTradeZone: `${round2(Math.min(levels.support1, price))}–${round2(Math.max(levels.resistance1, price))}`,
    },
    longSetup,
    shortSetup,
    finalDecision: { action, reason, preferredSetup, invalidationLevel },
    disclaimer: SIGNAL_DISCLAIMER,
  };
}

function makeSetup(o: {
  side: "long" | "short";
  entry: number;
  slDistance: number;
  targets: [number, number, number];
  lot: number;
  enabled: boolean;
  active: boolean;
}): Setup {
  const { side, entry, slDistance, targets, lot, enabled, active } = o;
  const long = side === "long";
  const stopLoss = round2(long ? entry - slDistance : entry + slDistance);
  const riskPerUnit = round2(Math.abs(entry - stopLoss));
  const t = (m: number) => round2(long ? entry + riskPerUnit * m : entry - riskPerUnit * m);
  const target1 = t(targets[0]);
  const target2 = t(targets[1]);
  const target3 = t(targets[2]);
  const rewardPerUnit = round2(Math.abs(target2 - entry));
  const status: SetupStatus = !enabled ? "avoid" : active ? "active" : "wait";
  return {
    status,
    ...(long ? { entryAbove: round2(entry) } : { entryBelow: round2(entry) }),
    stopLoss,
    target1,
    target2,
    target3,
    partialExit: target1, // book partial at T1
    fullExit: target3, // trail / full exit by T3
    riskPerUnit,
    rewardPerUnit,
    riskReward: `1:${targets[1]}`,
    estimatedProfitForOneLot: round2(rewardPerUnit * lot),
    estimatedLossForOneLot: round2(riskPerUnit * lot),
    condition: long
      ? `Go long on a sustained move above ${round2(entry)} with volume; book partial at ${target1}, trail to ${target3}; invalid below ${stopLoss}.`
      : `Go short on a sustained move below ${round2(entry)} with volume; book partial at ${target1}, trail to ${target3}; invalid above ${stopLoss}.`,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
