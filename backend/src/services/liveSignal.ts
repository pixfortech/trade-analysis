// =====================================================================
// Live Signal Engine — pure, deterministic (Phase 3E/3F, READ-ONLY)
// ---------------------------------------------------------------------
// Given a live quote + (optional) historical candles + a set of ACTIVE
// indicators, produce a practical market signal: trend, bullish/bearish
// probability, estimated win %, per-indicator contributions, and SEPARATE long
// & short setups (entry/SL/targets/exits) with their own risk-reward and
// *tentative* P/L per lot/quantity.
//
// READ-ONLY analysis only — NO order placement/modification/cancellation, no
// GTT/baskets, no execution. All probabilities and P/L figures are ESTIMATES,
// never guarantees; the disclaimer is always attached.
//
// Phase 3F P/L FIX: long and short stops are derived from DIFFERENT structure
// (recent swing low for long, swing high for short), so their risk distances —
// and therefore their P/L — genuinely differ instead of sharing one ATR value.
// =====================================================================

import {
  pivotLevels,
  round2,
  type Candle,
  type RiskProfile,
} from "./technicalAnalysis";
import {
  buildContributions,
  computeIndicators,
  parseActiveIndicators,
  type IndicatorContribution,
  type IndicatorId,
  type IndicatorValues,
} from "./indicatorEngine";

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
  quantity?: number | null; // optional explicit quantity; defaults to lotSize (or 1)
  activeIndicators?: IndicatorId[];
  oi?: number | null;
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
  quantity: number;
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
    ema9: number | null; // kept for backward-compat (maps to EMA20 now)
    ema20: number | null;
    ema50: number | null;
    rsi: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    atr: number | null;
    adx: { adx: number; plusDI: number; minusDI: number } | null;
    supertrend: { value: number; direction: "bullish" | "bearish" } | null;
    volumeConfirmed: boolean | null;
    oi: number | null;
  };
  activeIndicators: IndicatorId[];
  indicatorContributions: IndicatorContribution[];
  missingIndicators: IndicatorId[];
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
  preferredSetup: "long" | "short" | "none";
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
  const active = input.activeIndicators?.length ? input.activeIndicators : parseActiveIndicators(undefined);
  const hasCandles = Array.isArray(candles) && candles.length >= 20;
  const price = round2(quote.lastPrice);

  // --- Indicators via the engine (null-safe when data is thin) ---
  const values: IndicatorValues = hasCandles
    ? computeIndicators(candles as Candle[], input.oi ?? null)
    : {
        vwap: null,
        ema20: null,
        ema50: null,
        rsi: null,
        macd: null,
        atr: null,
        adx: null,
        supertrend: null,
        volume: null,
        oi: input.oi ?? null,
      };

  // --- Contributions from ACTIVE indicators only ---
  const { contributions, bullish, bearish, missing } = buildContributions(price, values, active, { prevOi: null });

  // --- Support / resistance + swing structure ---
  const recent = hasCandles ? (candles as Candle[]).slice(-30) : [];
  const refHigh = hasCandles ? Math.max(...recent.map((c) => c.h)) : quote.high;
  const refLow = hasCandles ? Math.min(...recent.map((c) => c.l)) : quote.low;
  const swingLow = hasCandles ? Math.min(...(candles as Candle[]).slice(-10).map((c) => c.l)) : quote.low;
  const swingHigh = hasCandles ? Math.max(...(candles as Candle[]).slice(-10).map((c) => c.h)) : quote.high;
  const levels = pivotLevels(refHigh, refLow, price);

  // --- Volatility unit ---
  const dayRange = Math.max(quote.high - quote.low, 0);
  const volUnit = values.atr && values.atr > 0 ? values.atr : dayRange > 0 ? dayRange * 0.5 : 0;
  const degenerate = volUnit <= 0 || refHigh <= refLow;

  // --- Trend direction/strength from active contributions ---
  const net = bullish - bearish;
  const direction = net >= 2 ? "bullish" : net <= -2 ? "bearish" : "sideways";
  const magnitude = Math.abs(net);
  const reasonParts = contributions
    .filter((c) => c.direction === "bullish" || c.direction === "bearish")
    .map((c) => `${c.id}:${c.direction}`);

  // --- Probability (bullish + bearish ≈ 100) ---
  const totalDirectional = bullish + bearish;
  let bullishPercent: number;
  if (totalDirectional === 0) bullishPercent = 50;
  else bullishPercent = clamp(round2(50 + (net / Math.max(totalDirectional, 1)) * 45), 5, 95);
  const bearishPercent = round2(100 - bullishPercent);

  // --- Confidence / data quality ---
  const volumeConfirmed = values.volume?.confirmed ?? null;
  let dataQuality: SignalDataQuality;
  if (!hasCandles) dataQuality = "quote-only";
  else if (contributions.filter((c) => c.direction !== "unavailable").length >= 6 && volumeConfirmed) dataQuality = "strong";
  else dataQuality = "candle-backed";

  let confidence: Confidence;
  if (!hasCandles || degenerate) confidence = "low";
  else if (magnitude >= 4 && (dataQuality === "strong" || volumeConfirmed)) confidence = "high";
  else if (magnitude >= 2) confidence = "medium";
  else confidence = "low";

  const strength: "weak" | "moderate" | "strong" =
    !hasCandles ? "weak" : magnitude >= 5 ? "strong" : magnitude >= 2 ? "moderate" : "weak";

  // --- Estimated win % (conservative, capped 35..75) ---
  const dominant = Math.max(bullishPercent, bearishPercent);
  let estimatedWinPercent = dominant;
  if (confidence === "low") estimatedWinPercent = Math.min(estimatedWinPercent, 55);
  else if (confidence === "medium") estimatedWinPercent = Math.min(estimatedWinPercent, 68);
  if (dataQuality === "quote-only") estimatedWinPercent = Math.min(estimatedWinPercent, 55);
  estimatedWinPercent = round2(clamp(estimatedWinPercent, 35, 75));

  // --- Setups (SEPARATE long & short structure → different P/L) ---
  const { slMult, targets } = PROFILE[riskProfile];
  const atrStop = volUnit * slMult;
  const qty = input.quantity && input.quantity > 0 ? input.quantity : lotSize && lotSize > 0 ? lotSize : 1;

  // Long entry above nearest resistance / breakout; SL at the LOWER of the
  // ATR stop and the recent swing low (structure-aware).
  const longEntry =
    price < levels.resistance1 ? levels.resistance1 : price < levels.resistance2 ? levels.resistance2 : round2(price + volUnit * 0.25);
  const longStop = hasCandles ? Math.min(longEntry - atrStop, swingLow) : longEntry - atrStop;
  const longSetup = makeSetup({
    side: "long",
    entry: longEntry,
    stopLoss: longStop,
    targets,
    qty,
    enabled: !degenerate,
    active: direction === "bullish" && confidence !== "low",
  });

  // Short entry below nearest support / breakdown; SL at the HIGHER of the
  // ATR stop and the recent swing high.
  const shortEntry =
    price > levels.support1 ? levels.support1 : price > levels.support2 ? levels.support2 : round2(price - volUnit * 0.25);
  const shortStop = hasCandles ? Math.max(shortEntry + atrStop, swingHigh) : shortEntry + atrStop;
  const shortSetup = makeSetup({
    side: "short",
    entry: shortEntry,
    stopLoss: shortStop,
    targets,
    qty,
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
    reason = `Bullish alignment (${reasonParts.join(", ")}). Prefer longs above ${longSetup.entryAbove}.`;
  } else if (direction === "bearish" && confidence !== "low") {
    action = "SHORT";
    preferredSetup = "short";
    reason = `Bearish alignment (${reasonParts.join(", ")}). Prefer shorts below ${shortSetup.entryBelow}.`;
  } else {
    action = "WAIT";
    preferredSetup = "none";
    reason = `No decisive edge yet (${reasonParts.join(", ") || "weak/conflicting signals"}). Wait for a clean break of ${levels.support1}–${levels.resistance1}.`;
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
      vwap: values.vwap,
    },
    indicators: {
      ema9: values.ema20,
      ema20: values.ema20,
      ema50: values.ema50,
      rsi: values.rsi,
      macd: values.macd,
      atr: values.atr,
      adx: values.adx,
      supertrend: values.supertrend,
      volumeConfirmed,
      oi: values.oi,
    },
    activeIndicators: active,
    indicatorContributions: contributions,
    missingIndicators: missing,
    trend: {
      direction,
      strength,
      score: net,
      reason: reasonParts.length ? `${reasonParts.join(", ")}.` : "Not enough active-indicator data; using live quote only.",
    },
    probability: { bullishPercent, bearishPercent, estimatedWinPercent, confidence, dataQuality },
    levels: {
      ...levels,
      noTradeZone: `${round2(Math.min(levels.support1, price))}–${round2(Math.max(levels.resistance1, price))}`,
    },
    longSetup,
    shortSetup,
    preferredSetup,
    finalDecision: { action, reason, preferredSetup, invalidationLevel },
    disclaimer: SIGNAL_DISCLAIMER,
  };
}

function makeSetup(o: {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  targets: [number, number, number];
  qty: number;
  enabled: boolean;
  active: boolean;
}): Setup {
  const { side, entry, stopLoss, targets, qty, enabled, active } = o;
  const long = side === "long";
  const sl = round2(stopLoss);
  // Risk per unit is the (genuinely side-specific) entry→stop distance.
  const riskPerUnit = round2(Math.abs(entry - sl));
  // Targets are R-multiples of THIS side's own risk distance.
  const t = (m: number) => round2(long ? entry + riskPerUnit * m : entry - riskPerUnit * m);
  const target1 = t(targets[0]);
  const target2 = t(targets[1]);
  const target3 = t(targets[2]);
  const rewardPerUnit = round2(Math.abs(target2 - entry));
  const status: SetupStatus = !enabled ? "avoid" : active ? "active" : "wait";
  // Phase 3F: explicit per-side P/L formulas.
  //   long  profit = (target - entry) * qty ;  long  loss = (entry - stop) * qty
  //   short profit = (entry - target) * qty ;  short loss = (stop - entry) * qty
  const estimatedProfitForOneLot = round2((long ? target2 - entry : entry - target2) * qty);
  const estimatedLossForOneLot = round2((long ? entry - sl : sl - entry) * qty);
  return {
    status,
    ...(long ? { entryAbove: round2(entry) } : { entryBelow: round2(entry) }),
    stopLoss: sl,
    target1,
    target2,
    target3,
    partialExit: target1,
    fullExit: target3,
    riskPerUnit,
    rewardPerUnit,
    riskReward: riskPerUnit > 0 ? `1:${round2(rewardPerUnit / riskPerUnit)}` : "—",
    quantity: qty,
    estimatedProfitForOneLot,
    estimatedLossForOneLot,
    condition: long
      ? `Go long on a sustained move above ${round2(entry)} with volume; book partial at ${target1}, trail to ${target3}; invalid below ${sl}.`
      : `Go short on a sustained move below ${round2(entry)} with volume; book partial at ${target1}, trail to ${target3}; invalid above ${sl}.`,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
