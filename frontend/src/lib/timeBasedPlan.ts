// Time-Based Exit Plan — derived from the REAL live-signal response (Phase 3J).
// No fabricated numbers: every level used here (VWAP, EMA, support/resistance,
// ATR, supertrend, the chosen setup's SL/targets) comes from the backend
// `/api/analysis/live-signal` response. We only translate those live values into
// holding-period guidance text. Advisory only — never automatic execution.

import type { LiveSignal } from "@/types/api";

export interface TimePlanRow {
  period: string;
  plan: string;
  exitCondition: string;
  trailStop: string;
  riskNote: string;
}

export interface TimeBasedPlanResult {
  side: "LONG" | "SHORT" | "WAIT";
  rows: TimePlanRow[];
  /** "scalp" | "10-15 min" | "30 min+" | "avoid" — best holding style now. */
  bestStyle: string;
  /** Enter now / Wait for breakout / Wait for pullback / Avoid trade. */
  recommendedAction: string;
}

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

export function buildTimeBasedPlan(s: LiveSignal): TimeBasedPlanResult {
  const action = s.finalDecision.action;

  if (action !== "LONG" && action !== "SHORT") {
    return {
      side: "WAIT",
      bestStyle: "avoid",
      recommendedAction: action === "AVOID" ? "Avoid trade" : "Wait for breakout",
      rows: [
        {
          period: "No active trade",
          plan: `Signal is ${action}. Stay flat until a clean break of the no-trade zone (${s.levels.noTradeZone}).`,
          exitCondition: `Long only above ${fmt(s.levels.resistance1)} with volume; short only below ${fmt(s.levels.support1)} with volume.`,
          trailStop: "—",
          riskNote: "No edge yet — forcing a trade here is low-probability.",
        },
      ],
    };
  }

  const long = action === "LONG";
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = long ? setup.entryAbove : setup.entryBelow;
  const price = s.currentPrice;
  const vwap = s.marketData.vwap;
  const ema = s.indicators.ema20;
  const st = s.indicators.supertrend?.value ?? null;
  const atr = s.indicators.atr;
  const nearLevel = long ? s.levels.resistance1 : s.levels.support1;
  const guardLevel = long ? s.levels.support1 : s.levels.resistance1;
  const reclaimRef = vwap ?? ema;

  const favour = long ? "above" : "below";
  const against = long ? "below" : "above";
  const reverseCandle = long ? "bearish reversal candle" : "bullish reversal candle";

  const rows: TimePlanRow[] = [
    {
      period: "5 minutes (scalp)",
      plan: `Scalp only if price sustains ${favour} entry ${fmt(entry)} for 1–2 candles. Book partial near ${fmt(nearLevel)} / Target 1 ${fmt(setup.target1)}.`,
      exitCondition: `Exit if it fails to continue ${favour} within ~2 candles${reclaimRef != null ? `, or reclaims ${against} ${fmt(reclaimRef)} (VWAP/EMA)` : ""}, or a ${reverseCandle} prints.`,
      trailStop: `Move stop to entry ${fmt(entry)} after the first favourable move.`,
      riskNote: "Fast-reversal risk is high; smallest size.",
    },
    {
      period: "10 minutes",
      plan: `Hold only if the ${long ? "higher-high/higher-low" : "lower-high/lower-low"} structure holds and the candle closes ${favour} ${fmt(entry)}.`,
      exitCondition: `Exit on a close ${against} ${fmt(guardLevel)} or a ${reverseCandle} with volume.`,
      trailStop: `Trail just ${against} the latest ${long ? "higher low" : "lower high"}.`,
      riskNote: `Hard invalidation: ${fmt(setup.stopLoss)}.`,
    },
    {
      period: "15 minutes",
      plan: `Hold for Target 2 ${fmt(setup.target2)} only with volume confirmation in the signal direction.`,
      exitCondition: `Exit if ${reclaimRef != null ? `price reclaims ${against} ${fmt(reclaimRef)} (VWAP/EMA)` : "a strong opposite candle prints"} or momentum stalls.`,
      trailStop: `Trail ${against} the prior swing candle.`,
      riskNote: "Avoid widening the stop to “give it room”.",
    },
    {
      period: "30 minutes",
      plan: `Hold only while Supertrend/VWAP/EMA stay ${long ? "bullish" : "bearish"}${st != null ? ` (Supertrend ${fmt(st)})` : ""}. Aim for Target 3 ${fmt(setup.target3)}.`,
      exitCondition: `Exit near the next major ${long ? "resistance" : "support"} or if the trend score weakens / Supertrend flips.`,
      trailStop: `ATR-based trail${atr != null ? ` (~${fmt(atr)} pts)` : ""}, or trail behind Supertrend.`,
      riskNote: "Book at least partial into the target zone.",
    },
    {
      period: "1 hour",
      plan: `Hold only if the trend remains strong (currently ${s.trend.direction}, ${s.trend.strength}) with no reversal candle.`,
      exitCondition: `Exit on a confirmed reversal, a close ${against} ${fmt(st ?? guardLevel)}, or loss of the higher-timeframe trend.`,
      trailStop: "Wider ATR/Supertrend trail; don’t micromanage.",
      riskNote: "Most intraday moves don’t sustain this long — be selective.",
    },
    {
      period: "Intraday till close",
      plan: "Hold a winner only while the trend is intact; otherwise square off intraday.",
      exitCondition: "Exit by ~15:20 IST (avoid the closing auction) or on any reversal signal. Don’t carry a losing intraday trade overnight.",
      trailStop: "Tighten the trail into the last 30–45 minutes.",
      riskNote: "Overnight gap risk if carried as positional/F&O.",
    },
  ];

  // Best style: strong+confirmed → 30 min+; medium → 10–15 min; weak/low → scalp.
  let bestStyle: string;
  if (s.trend.strength === "strong" && s.probability.confidence === "high") bestStyle = "30 min+";
  else if (s.trend.strength !== "weak" && s.probability.confidence !== "low") bestStyle = "10–15 min";
  else bestStyle = "scalp";

  // Recommended action from price vs entry.
  let recommendedAction: string;
  if (entry == null) recommendedAction = long ? "Wait for breakout" : "Wait for breakdown";
  else if (long) recommendedAction = price >= entry ? "Enter now (breakout active)" : "Wait for breakout above entry";
  else recommendedAction = price <= entry ? "Enter now (breakdown active)" : "Wait for breakdown below entry";

  return { side: action, rows, bestStyle, recommendedAction };
}
