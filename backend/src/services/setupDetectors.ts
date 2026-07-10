// =====================================================================
// Market-regime classification (§4) + specialised, INDEPENDENT setup detectors
// (§5). Pure & deterministic. Each detector returns a candidate (or nothing);
// the decision engine chooses among them and applies the approval gates. No
// thresholds are baked in — everything comes from intelConfig.loop.
//
// Detectors:
//   A. Connors RSI mean-reversion (with a trend filter + candle confirmation)
//   B. Trend-continuation (EMA/VWAP/Supertrend/ADX/volume breakout)
//   C. Range Filter + HACOLT  → SECONDARY confirmation only (never standalone)
//   D. Breakout / Breakdown   → "WAIT FOR BREAKOUT" / "WAIT FOR BREAKDOWN"
// =====================================================================

import { round2, type Candle, type RiskProfile } from "./technicalAnalysis";
import type { ChandelierResult, RangeFilterResult } from "./strategyIndicators";
import { intelConfig } from "../config/intelligence.config";

export type Regime =
  | "STRONG_UPTREND"
  | "UPTREND"
  | "RANGE"
  | "DOWNTREND"
  | "STRONG_DOWNTREND"
  | "HIGH_VOLATILITY"
  | "NEWS_SHOCK"
  | "BREAKOUT_ATTEMPT"
  | "BREAKDOWN_ATTEMPT"
  | "REVERSAL_ATTEMPT"
  | "UNCERTAIN";

export type SetupType = "connors-rsi" | "trend-continuation" | "breakout" | "breakdown" | "range-hacolt";
export type SetupDirection = "LONG" | "SHORT";

export interface SetupCandidate {
  type: SetupType;
  direction: SetupDirection;
  label: string;
  trigger: number | null; // price that arms the entry (null = enter at market/zone)
  safeZone: { lo: number; hi: number } | null;
  stop: number;
  targets: number[];
  rr: number | null;
  confidence: number; // 0–100 setup-local strength (NOT the final approval)
  reasons: string[];
  blockers: string[];
  secondary: boolean; // confirmation-only (Range Filter + HACOLT)
  triggered: boolean; // price has crossed the trigger
  inSafeZone: boolean; // price is inside the safe entry zone
}

export interface DetectorContext {
  candles: Candle[];
  price: number;
  atr: number | null;
  ema20: number | null;
  ema50: number | null;
  trendEma: number | null;
  vwap: number | null;
  adx: { adx: number; plusDI: number; minusDI: number } | null;
  supertrend: { value: number; direction: "bullish" | "bearish" } | null;
  connorsRSI: number | null;
  chandelier: ChandelierResult | null;
  rangeFilter: RangeFilterResult | null;
  hacolt: "bullish" | "bearish" | "neutral" | null;
  volumeConfirmed: boolean | null;
  riskProfile: RiskProfile;
  newsShock: boolean;
  atrExpansionPct: number | null; // current ATR vs recent-average ATR, %
  vixHigh: boolean;
}

const SL_MULT: Record<RiskProfile, number> = { conservative: 1.5, balanced: 1.0, aggressive: 0.75 };

/* ------------------------------- regime --------------------------------- */
export function classifyRegime(ctx: DetectorContext): { regime: Regime; reasons: string[] } {
  const cfg = intelConfig.loop.regime;
  const adx = ctx.adx?.adx ?? null;
  const diBull = ctx.adx ? ctx.adx.plusDI > ctx.adx.minusDI : null;
  const emaBull = ctx.ema20 != null && ctx.ema50 != null ? ctx.ema20 > ctx.ema50 : null;
  const stBull = ctx.supertrend ? ctx.supertrend.direction === "bullish" : null;
  const aboveVwap = ctx.vwap != null ? ctx.price > ctx.vwap : null;
  const { hi, lo } = swing(ctx.candles, intelConfig.loop.breakout.lookback);

  if (ctx.newsShock) return { regime: "NEWS_SHOCK", reasons: ["A recent high-impact headline dominates — treat structure with caution."] };
  if (ctx.vixHigh || (ctx.atrExpansionPct != null && ctx.atrExpansionPct > cfg.atrExpansionPct * 2)) {
    return { regime: "HIGH_VOLATILITY", reasons: [ctx.vixHigh ? "VIX in a high regime." : `ATR expanded ${Math.round(ctx.atrExpansionPct ?? 0)}% vs its recent average.`] };
  }

  const aligned = (bull: boolean) => (emaBull === bull) && (diBull === bull) && (stBull === bull);
  if (adx != null && adx >= cfg.adxStrongMin && aligned(true)) return { regime: "STRONG_UPTREND", reasons: [`ADX ${adx} with EMA + Supertrend + DI+ all aligned up.`] };
  if (adx != null && adx >= cfg.adxStrongMin && aligned(false)) return { regime: "STRONG_DOWNTREND", reasons: [`ADX ${adx} with EMA + Supertrend + DI- all aligned down.`] };
  if (adx != null && adx >= cfg.adxTrendMin && emaBull === true && diBull === true) return { regime: "UPTREND", reasons: [`ADX ${adx}, EMA20>EMA50, DI+ leads.`] };
  if (adx != null && adx >= cfg.adxTrendMin && emaBull === false && diBull === false) return { regime: "DOWNTREND", reasons: [`ADX ${adx}, EMA20<EMA50, DI- leads.`] };

  // Weak/absent trend → look for a break attempt or a reversal, else range.
  if (hi != null && ctx.price >= hi && aboveVwap) return { regime: "BREAKOUT_ATTEMPT", reasons: ["Price is testing the top of its recent range."] };
  if (lo != null && ctx.price <= lo && aboveVwap === false) return { regime: "BREAKDOWN_ATTEMPT", reasons: ["Price is testing the bottom of its recent range."] };
  if (emaBull != null && stBull != null && emaBull !== stBull) return { regime: "REVERSAL_ATTEMPT", reasons: ["EMA trend and Supertrend disagree — possible turn."] };
  if (adx != null && adx < cfg.adxTrendMin) return { regime: "RANGE", reasons: [`ADX ${adx} < ${cfg.adxTrendMin} — no directional trend.`] };
  return { regime: "UNCERTAIN", reasons: ["Insufficient agreement to classify the regime."] };
}

/* ------------------------------ detectors -------------------------------- */
export function detectSetups(ctx: DetectorContext, regime: Regime): SetupCandidate[] {
  const out: SetupCandidate[] = [];
  const push = (c: SetupCandidate | null) => { if (c) out.push(c); };
  push(connorsSetup(ctx, regime));
  push(trendContinuation(ctx, regime));
  push(breakoutSetup(ctx, regime));
  push(rangeHacolt(ctx));
  // Strongest first; secondary (confirmation-only) setups always rank below primaries.
  return out.sort((a, b) => Number(a.secondary) - Number(b.secondary) || b.confidence - a.confidence);
}

/** Build stop/targets/RR for a direction from ATR + risk profile; RR ≥ config min. */
function levelsFor(ctx: DetectorContext, dir: SetupDirection, entry: number, structuralStop: number | null): { stop: number; targets: number[]; rr: number | null } {
  const atr = ctx.atr ?? Math.max(0.01, entry * 0.005);
  const slDist = atr * SL_MULT[ctx.riskProfile];
  const stop = structuralStop != null && Math.sign(dir === "LONG" ? entry - structuralStop : structuralStop - entry) > 0
    ? structuralStop
    : dir === "LONG" ? entry - slDist : entry + slDist;
  const risk = Math.abs(entry - stop);
  const rrMin = intelConfig.loop.rrMin;
  const t = dir === "LONG"
    ? [entry + risk * rrMin, entry + risk * rrMin * 1.8]
    : [entry - risk * rrMin, entry - risk * rrMin * 1.8];
  return { stop: round2(stop), targets: t.map(round2), rr: risk > 0 ? round2((Math.abs(t[0] - entry)) / risk) : null };
}

function inZone(ctx: DetectorContext, entry: number): { safeZone: { lo: number; hi: number }; inSafeZone: boolean } {
  const buf = (ctx.atr ?? entry * 0.005) * intelConfig.loop.safeZoneAtrMult;
  const lo = round2(entry - buf);
  const hi = round2(entry + buf);
  return { safeZone: { lo, hi }, inSafeZone: ctx.price >= lo && ctx.price <= hi };
}

/** A: Connors RSI mean-reversion with trend filter + candle confirmation. */
function connorsSetup(ctx: DetectorContext, regime: Regime): SetupCandidate | null {
  const c = intelConfig.loop.connors;
  if (ctx.connorsRSI == null || ctx.trendEma == null) return null;
  const lastBull = ctx.candles.length >= 1 && ctx.candles[ctx.candles.length - 1].c >= ctx.candles[ctx.candles.length - 1].o;
  const reasons: string[] = [];
  const blockers: string[] = [];

  const longOk = ctx.price > ctx.trendEma && ctx.connorsRSI <= c.oversold && (c.confirmCandles === 0 || lastBull);
  const shortOk = ctx.price < ctx.trendEma && ctx.connorsRSI >= c.overbought && (c.confirmCandles === 0 || !lastBull);
  if (!longOk && !shortOk) return null;

  const dir: SetupDirection = longOk ? "LONG" : "SHORT";
  reasons.push(`Connors RSI ${ctx.connorsRSI} ${dir === "LONG" ? `≤ ${c.oversold} (stretched down)` : `≥ ${c.overbought} (stretched up)`}`);
  reasons.push(`Price ${dir === "LONG" ? "above" : "below"} trend EMA(${c.trendEmaPeriod}) — pullback with trend`);
  if (c.confirmCandles > 0) reasons.push(`${dir === "LONG" ? "Bullish" : "Bearish"} confirmation candle present`);
  if (regime === "STRONG_DOWNTREND" && dir === "LONG") blockers.push("Strong downtrend regime — mean-reversion long is lower quality.");
  if (regime === "STRONG_UPTREND" && dir === "SHORT") blockers.push("Strong uptrend regime — mean-reversion short is lower quality.");

  const entry = ctx.price;
  const { stop, targets, rr } = levelsFor(ctx, dir, entry, null);
  const zone = inZone(ctx, entry);
  const confidence = clampScore(58 + (dir === "LONG" ? c.oversold - ctx.connorsRSI : ctx.connorsRSI - c.overbought) - blockers.length * 12);
  return { type: "connors-rsi", direction: dir, label: dir === "LONG" ? "Mean-reversion long" : "Mean-reversion short", trigger: null, ...zone, stop, targets, rr, confidence, reasons, blockers, secondary: false, triggered: true, inSafeZone: zone.inSafeZone };
}

/** B: Trend-continuation breakout in the trend direction. */
function trendContinuation(ctx: DetectorContext, regime: Regime): SetupCandidate | null {
  const up = regime === "UPTREND" || regime === "STRONG_UPTREND";
  const down = regime === "DOWNTREND" || regime === "STRONG_DOWNTREND";
  if (!up && !down) return null;
  const dir: SetupDirection = up ? "LONG" : "SHORT";
  const { hi, lo } = swing(ctx.candles, intelConfig.loop.breakout.lookback);
  const level = up ? hi : lo;
  if (level == null) return null;
  const buf = (ctx.atr ?? level * 0.005) * intelConfig.loop.breakout.atrBufferMult;
  const trigger = round2(up ? level + buf : level - buf);

  const reasons: string[] = [`${regime.replace(/_/g, " ").toLowerCase()} regime`, `${dir === "LONG" ? "Above" : "Below"} VWAP/EMA structure`];
  const blockers: string[] = [];
  if (ctx.vwap != null && ((dir === "LONG" && ctx.price < ctx.vwap) || (dir === "SHORT" && ctx.price > ctx.vwap))) blockers.push(`Price on the wrong side of VWAP for a ${dir.toLowerCase()}.`);
  if (ctx.volumeConfirmed === false) blockers.push("Volume does not confirm the move.");
  else if (ctx.volumeConfirmed === true) reasons.push("Volume confirms the move.");

  const structuralStop = up ? ctx.supertrend?.value ?? ctx.ema20 ?? null : ctx.supertrend?.value ?? ctx.ema20 ?? null;
  const { stop, targets, rr } = levelsFor(ctx, dir, trigger, structuralStop ?? null);
  const zone = inZone(ctx, trigger);
  const triggered = up ? ctx.price >= trigger : ctx.price <= trigger;
  const adxBonus = ctx.adx ? Math.min(20, Math.max(0, ctx.adx.adx - intelConfig.loop.regime.adxTrendMin)) : 0;
  const confidence = clampScore(60 + adxBonus - blockers.length * 14 + (ctx.volumeConfirmed ? 6 : 0));
  return { type: "trend-continuation", direction: dir, label: up ? "Trend-continuation long" : "Trend-continuation short", trigger, ...zone, stop, targets, rr, confidence, reasons, blockers, secondary: false, triggered, inSafeZone: zone.inSafeZone };
}

/** D: Breakout / breakdown from the recent range with volume expansion. */
function breakoutSetup(ctx: DetectorContext, regime: Regime): SetupCandidate | null {
  const attemptUp = regime === "BREAKOUT_ATTEMPT";
  const attemptDown = regime === "BREAKDOWN_ATTEMPT";
  if (!attemptUp && !attemptDown) return null;
  const dir: SetupDirection = attemptUp ? "LONG" : "SHORT";
  const { hi, lo } = swing(ctx.candles, intelConfig.loop.breakout.lookback);
  const level = attemptUp ? hi : lo;
  if (level == null) return null;
  const buf = (ctx.atr ?? level * 0.005) * intelConfig.loop.breakout.atrBufferMult;
  const trigger = round2(attemptUp ? level + buf : level - buf);
  const reasons: string[] = [attemptUp ? "Testing recent range high" : "Testing recent range low"];
  const blockers: string[] = [];
  if (ctx.volumeConfirmed === false) blockers.push("No volume expansion yet — false-break risk.");
  else if (ctx.volumeConfirmed === true) reasons.push("Volume is expanding into the level.");

  const structuralStop = attemptUp ? lo : hi;
  const { stop, targets, rr } = levelsFor(ctx, dir, trigger, structuralStop ?? null);
  const zone = inZone(ctx, trigger);
  const triggered = attemptUp ? ctx.price >= trigger : ctx.price <= trigger;
  const confidence = clampScore(52 - blockers.length * 12 + (ctx.volumeConfirmed ? 10 : 0));
  return { type: attemptUp ? "breakout" : "breakdown", direction: dir, label: attemptUp ? "WAIT FOR BREAKOUT" : "WAIT FOR BREAKDOWN", trigger, ...zone, stop, targets, rr, confidence, reasons, blockers, secondary: false, triggered, inSafeZone: zone.inSafeZone };
}

/** C: Range Filter + HACOLT — SECONDARY confirmation only. */
function rangeHacolt(ctx: DetectorContext): SetupCandidate | null {
  if (!ctx.rangeFilter || !ctx.hacolt) return null;
  const bull = ctx.rangeFilter.dir === "bullish" && ctx.hacolt === "bullish";
  const bear = ctx.rangeFilter.dir === "bearish" && ctx.hacolt === "bearish";
  if (!bull && !bear) return null;
  const dir: SetupDirection = bull ? "LONG" : "SHORT";
  const entry = ctx.price;
  const { stop, targets, rr } = levelsFor(ctx, dir, entry, null);
  const zone = inZone(ctx, entry);
  return {
    type: "range-hacolt", direction: dir, label: `${dir === "LONG" ? "Bullish" : "Bearish"} confirmation (RF+HACOLT)`,
    trigger: null, ...zone, stop, targets, rr, confidence: clampScore(45), reasons: [`Range Filter ${ctx.rangeFilter.dir}`, `HACOLT ${ctx.hacolt}`],
    blockers: ["Secondary confirmation only — cannot arm an entry on its own."], secondary: true, triggered: false, inSafeZone: zone.inSafeZone,
  };
}

/* ------------------------------- helpers -------------------------------- */
function swing(candles: Candle[], lookback: number): { hi: number | null; lo: number | null } {
  if (candles.length < 2) return { hi: null, lo: null };
  const start = Math.max(0, candles.length - 1 - lookback);
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = start; i < candles.length - 1; i++) {
    if (candles[i].h > hi) hi = candles[i].h;
    if (candles[i].l < lo) lo = candles[i].l;
  }
  return { hi: hi === -Infinity ? null : round2(hi), lo: lo === Infinity ? null : round2(lo) };
}

function clampScore(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}
