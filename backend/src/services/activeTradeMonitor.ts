// =====================================================================
// Active Trade Monitor — pure, READ-ONLY (Phase 3F)
// ---------------------------------------------------------------------
// Given a user's MANUALLY-entered position (direction, entry, qty) and the
// current live signal, compute current P/L, detect trend reversal against the
// position, and recommend a read-only action (HOLD / TIGHTEN_SL / EXIT_NOW /
// PARTIAL_EXIT / REVERSE_SETUP / WAIT_FOR_REENTRY) with a best-exit-for-least-
// loss level and an opposite re-entry plan.
//
// This NEVER places, modifies or cancels orders. It is advisory only; all
// numbers are estimates and the disclaimer is always attached.
// =====================================================================

import { round2 } from "./technicalAnalysis";
import type { LiveSignalResult } from "./liveSignal";

export type PositionDirection = "LONG" | "SHORT";
export type AlertSeverity = "info" | "caution" | "urgent";
export type MonitorAction =
  | "HOLD"
  | "TIGHTEN_SL"
  | "EXIT_NOW"
  | "PARTIAL_EXIT"
  | "REVERSE_SETUP"
  | "WAIT_FOR_REENTRY";

export interface MonitorInput {
  positionDirection: PositionDirection;
  entryPrice: number;
  quantity: number;
  signal: LiveSignalResult;
}

export interface MonitorResult {
  positionDirection: PositionDirection;
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  currentPnL: number; // per position (qty applied), signed
  currentPnLPerUnit: number;
  trendChangeDetected: boolean;
  previousTrend: "with-position" | "against-position" | "neutral";
  currentTrend: "bullish" | "bearish" | "sideways";
  recommendedAction: MonitorAction;
  bestExitForLeastLoss: number;
  updatedStopLoss: number;
  newEntryPlan: {
    direction: PositionDirection | "none";
    entryLevel: number | null;
    stopLoss: number | null;
    target1: number | null;
    target2: number | null;
    note: string;
  };
  alertSeverity: AlertSeverity;
  reason: string;
  readOnly: true;
  disclaimer: string;
}

/**
 * Evaluate a manual position against the current signal. Pure.
 * Reversal logic favours capital preservation: a confirmed opposite trend on a
 * profitable/at-risk position suggests EXIT_NOW; an early/weak flip suggests
 * TIGHTEN_SL; alignment suggests HOLD (or PARTIAL_EXIT near targets).
 */
export function evaluatePosition(input: MonitorInput): MonitorResult {
  const { positionDirection, entryPrice, quantity, signal } = input;
  const long = positionDirection === "LONG";
  const price = signal.currentPrice;
  const trend = signal.trend.direction;
  const confidence = signal.probability.confidence;

  const currentPnLPerUnit = round2(long ? price - entryPrice : entryPrice - price);
  const currentPnL = round2(currentPnLPerUnit * quantity);

  // Trend relative to the position.
  const trendAgainst = (long && trend === "bearish") || (!long && trend === "bullish");
  const trendWith = (long && trend === "bullish") || (!long && trend === "bearish");
  const currentTrend = trend;
  const previousTrend = trendWith ? "with-position" : trendAgainst ? "against-position" : "neutral";

  // Trailing stop from the same-side setup (Supertrend/ATR-derived in the signal).
  const sideSetup = long ? signal.longSetup : signal.shortSetup;
  const supertrend = signal.indicators.supertrend?.value ?? null;
  // Trailing SL: prefer Supertrend when on the protective side, else setup stop.
  let updatedStopLoss = sideSetup.stopLoss;
  if (supertrend != null) {
    updatedStopLoss = long ? Math.max(updatedStopLoss, round2(supertrend)) : Math.min(updatedStopLoss, round2(supertrend));
  }
  updatedStopLoss = round2(updatedStopLoss);

  // Hard invalidation: position stop breached by price.
  const hardBreached = long ? price <= sideSetup.stopLoss : price >= sideSetup.stopLoss;

  // Best exit for least loss: if reversing, exit near the better of current
  // price and the nearest protective level (don't chase further into loss).
  const nearestProtective = long ? signal.levels.support1 : signal.levels.resistance1;
  const bestExitForLeastLoss = round2(
    long ? Math.max(price, Math.min(nearestProtective, price)) : Math.min(price, Math.max(nearestProtective, price)),
  );

  // Opposite re-entry plan (only meaningful once reversal is confirmed).
  const oppSetup = long ? signal.shortSetup : signal.longSetup;
  const oppDir: PositionDirection = long ? "SHORT" : "LONG";

  let recommendedAction: MonitorAction;
  let alertSeverity: AlertSeverity;
  let reason: string;
  let trendChangeDetected = false;

  if (hardBreached) {
    recommendedAction = "EXIT_NOW";
    alertSeverity = "urgent";
    trendChangeDetected = trendAgainst;
    reason = `Price ${price} has breached the position stop ${sideSetup.stopLoss}. Hard invalidation — exit to cap the loss.`;
  } else if (trendAgainst && confidence === "high") {
    recommendedAction = "EXIT_NOW";
    alertSeverity = "urgent";
    trendChangeDetected = true;
    reason = `Trend has flipped ${trend} against your ${positionDirection} with high confidence (${signal.trend.reason}). Exit near ${bestExitForLeastLoss} for least loss; consider an opposite ${oppDir} only after ${oppSetup.entryAbove ?? oppSetup.entryBelow} breaks.`;
  } else if (trendAgainst && confidence === "medium") {
    recommendedAction = "TIGHTEN_SL";
    alertSeverity = "caution";
    trendChangeDetected = true;
    reason = `Reversal risk: trend turning ${trend} against your ${positionDirection} (medium confidence). Tighten stop to ${updatedStopLoss} rather than exiting blindly; exit if ${sideSetup.stopLoss} breaks.`;
  } else if (trendWith && nearTarget(long, price, sideSetup)) {
    recommendedAction = "PARTIAL_EXIT";
    alertSeverity = "info";
    reason = `Price ${price} is near Target 1 ${sideSetup.target1}. Book partial and trail the rest to ${sideSetup.target3}.`;
  } else if (trendWith) {
    recommendedAction = "HOLD";
    alertSeverity = "info";
    reason = `Trend remains ${trend} with your ${positionDirection}. Hold; trail stop to ${updatedStopLoss}.`;
  } else {
    recommendedAction = "HOLD";
    alertSeverity = "info";
    reason = `Trend is ${trend} (no strong reversal signal). Hold with stop at ${updatedStopLoss} and watch ${signal.levels.support1}–${signal.levels.resistance1}.`;
  }

  // Re-entry plan only when a reversal is detected/confirmed.
  const reentryConfirmed = trendChangeDetected && confidence !== "low";
  const newEntryPlan = reentryConfirmed
    ? {
        direction: oppDir,
        entryLevel: oppDir === "LONG" ? (oppSetup.entryAbove ?? null) : (oppSetup.entryBelow ?? null),
        stopLoss: oppSetup.stopLoss,
        target1: oppSetup.target1,
        target2: oppSetup.target2,
        note: `If the reversal confirms, an opposite ${oppDir} can be considered on a break of ${oppSetup.entryAbove ?? oppSetup.entryBelow}.`,
      }
    : {
        direction: "none" as const,
        entryLevel: null,
        stopLoss: null,
        target1: null,
        target2: null,
        note: "No confirmed reversal yet — no opposite re-entry suggested.",
      };

  return {
    positionDirection,
    entryPrice: round2(entryPrice),
    quantity,
    currentPrice: price,
    currentPnL,
    currentPnLPerUnit,
    trendChangeDetected,
    previousTrend,
    currentTrend,
    recommendedAction,
    bestExitForLeastLoss,
    updatedStopLoss,
    newEntryPlan,
    alertSeverity,
    reason,
    readOnly: true,
    disclaimer: signal.disclaimer,
  };
}

function nearTarget(long: boolean, price: number, setup: { target1: number }): boolean {
  // within ~25% of the move to T1 (rough "approaching target" heuristic)
  return long ? price >= setup.target1 * 0.997 : price <= setup.target1 * 1.003;
}
