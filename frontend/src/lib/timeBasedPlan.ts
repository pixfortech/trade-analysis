// Time-Based Exit Plan — derived from the REAL live-signal response (Phase 3I).
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

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

/**
 * Build the time-based plan for the signal's preferred direction. If the signal
 * is WAIT/AVOID, returns a single "no-trade" row. Long vs short logic is
 * mirrored around the live levels.
 */
export function buildTimeBasedPlan(s: LiveSignal): { side: "LONG" | "SHORT" | "WAIT"; rows: TimePlanRow[] } {
  const action = s.finalDecision.action;
  if (action !== "LONG" && action !== "SHORT") {
    return {
      side: "WAIT",
      rows: [
        {
          period: "No active trade",
          plan: `Signal is ${action}. Stay flat until a clean break of the no-trade zone (${s.levels.noTradeZone}).`,
          exitCondition: `Wait for price to break ${fmt(s.levels.resistance1)} (long) or ${fmt(s.levels.support1)} (short) with volume.`,
          trailStop: "—",
          riskNote: "No edge yet — avoid forcing a position.",
        },
      ],
    };
  }

  const long = action === "LONG";
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = long ? setup.entryAbove : setup.entryBelow;
  const vwap = s.marketData.vwap;
  const ema = s.indicators.ema20;
  const supertrend = s.indicators.supertrend?.value ?? null;
  const nearLevel = long ? s.levels.resistance1 : s.levels.support1; // first profit zone
  const guardLevel = long ? s.levels.support1 : s.levels.resistance1; // structure guard
  const reclaimRef = vwap ?? ema; // the line that, if reclaimed against you, kills the move

  const dir = long ? "long" : "short";
  const against = long ? "below" : "above";
  const favour = long ? "above" : "below";

  const rows: TimePlanRow[] = [
    {
      period: "5 min (scalp)",
      plan: `Scalp only. Book partial near the first ${long ? "resistance" : "support"} ${fmt(nearLevel)} / Target 1 ${fmt(setup.target1)}.`,
      exitCondition: `Exit if price fails to move ${favour} within ~2 candles${reclaimRef != null ? `, or reclaims ${long ? "below" : "above"} ${fmt(reclaimRef)} (VWAP/EMA).` : "."}`,
      trailStop: `Move stop to entry ${fmt(entry)} after the first favourable move.`,
      riskNote: "Fast-reversal risk is high; keep size small.",
    },
    {
      period: "10–15 min (intraday)",
      plan: `Hold only if a candle closes ${favour} ${fmt(entry)} with volume confirmation. Aim for Target 2 ${fmt(setup.target2)}.`,
      exitCondition: `Exit on a ${reclaimRef != null ? `${long ? "VWAP/EMA reclaim below" : "VWAP/EMA reclaim above"} ${fmt(reclaimRef)}` : "strong opposite candle"} or a close ${against} ${fmt(guardLevel)}.`,
      trailStop: `Trail just ${against} the most recent swing candle.`,
      riskNote: `Invalidation: ${fmt(setup.stopLoss)} (hard stop).`,
    },
    {
      period: "30 min+ (trend hold)",
      plan: `Hold only while the ${dir} trend stays aligned (trend ${s.trend.direction}, strength ${s.trend.strength}). Target 3 ${fmt(setup.target3)}.`,
      exitCondition: `Exit near the next major ${long ? "resistance" : "support"} or if the trend score weakens / Supertrend flips${supertrend != null ? ` (currently ${fmt(supertrend)})` : ""}.`,
      trailStop: `ATR-based trail${s.indicators.atr != null ? ` (~${fmt(s.indicators.atr)} pts)` : ""}; or trail behind Supertrend.`,
      riskNote: "Give the trade room, but never widen the hard stop.",
    },
    {
      period: "Intraday close",
      plan: "Square off before the close unless it is a positional/F&O carry you intend to hold overnight.",
      exitCondition: "Exit by ~15:20 IST to avoid closing-auction slippage; don't carry a losing intraday position.",
      trailStop: "Tighten the trail into the last 30–45 minutes.",
      riskNote: "Overnight gap risk applies if you carry the position.",
    },
  ];

  return { side: action, rows };
}
