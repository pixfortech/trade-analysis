// Tentative Profit / Loss preview — PURE, deterministic math (frontend mirror of
// backend/src/services/profitPreview.ts, which carries the unit tests for the
// acceptance numbers). Given a LOCKED plan (entry / safe-exit / target / stop),
// the REAL contract lot size and the number of lots, compute the points + rupee
// outcomes for the safe-exit, Target-1 and stop scenarios. Direction-aware.
//
// This is an ESTIMATE for planning only — never an order, never sizing that gets
// executed. It is fully decoupled from entry APPROVAL: the preview renders even
// when entry is not approved (the caller labels it a scenario estimate). Locked
// levels do NOT move here; only the live-CMP-derived distance updates each tick.

export type TradeDirection = "LONG" | "SHORT";

export interface CostModel {
  enabled: boolean;
  brokeragePerOrder: number;
  orderLegs: number;
  taxesPctOfTurnover: number;
}

export interface ProfitPreviewInput {
  direction: TradeDirection;
  cmp: number | null;
  entry: number;
  safeExit: number | null;
  target1: number | null;
  stopLoss: number | null;
  lotSize: number;
  lots: number;
  costs?: CostModel;
}

export interface ProfitPreview {
  direction: TradeDirection;
  lotSize: number;
  lots: number;
  quantity: number;
  pointsToEntry: number | null;
  safeExit: number | null;
  safeProfitPoints: number | null;
  safeGrossProfit: number | null;
  target1: number | null;
  target1ProfitPoints: number | null;
  target1MaxProfit: number | null;
  stopLoss: number | null;
  maxLossPoints: number | null;
  maxLoss: number | null;
  riskReward: number | null;
  costsEnabled: boolean;
  estimatedCosts: number | null;
  safeNetProfit: number | null;
  target1NetProfit: number | null;
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function profitPoints(direction: TradeDirection, entry: number, level: number): number {
  return r2(direction === "LONG" ? level - entry : entry - level);
}

function estimateCosts(costs: CostModel, entry: number, exitPrice: number, qty: number): number {
  const brokerage = costs.brokeragePerOrder * costs.orderLegs;
  const turnover = (entry + exitPrice) * qty;
  const taxes = (costs.taxesPctOfTurnover / 100) * turnover;
  return r2(brokerage + taxes);
}

/** Compute the Tentative P/L preview. Pure — no I/O, no clock, no side effects. */
export function computeProfitPreview(input: ProfitPreviewInput): ProfitPreview {
  const { direction, cmp, entry, safeExit, target1, stopLoss, lotSize, lots, costs } = input;
  const quantity = Math.max(0, Math.round(lotSize * lots));

  const pointsToEntry = cmp == null ? null : r2(direction === "LONG" ? entry - cmp : cmp - entry);

  const safeProfitPoints = safeExit == null ? null : profitPoints(direction, entry, safeExit);
  const safeGrossProfit = safeProfitPoints == null ? null : r2(safeProfitPoints * quantity);

  const target1ProfitPoints = target1 == null ? null : profitPoints(direction, entry, target1);
  const target1MaxProfit = target1ProfitPoints == null ? null : r2(target1ProfitPoints * quantity);

  const maxLossPoints = stopLoss == null ? null : r2(Math.abs(direction === "LONG" ? entry - stopLoss : stopLoss - entry));
  const maxLoss = maxLossPoints == null ? null : r2(maxLossPoints * quantity);

  const riskReward = target1ProfitPoints != null && maxLossPoints != null && maxLossPoints > 0 ? r2(target1ProfitPoints / maxLossPoints) : null;

  const costsEnabled = !!costs?.enabled;
  let estimatedCosts: number | null = null;
  let safeNetProfit: number | null = null;
  let target1NetProfit: number | null = null;
  if (costsEnabled && costs) {
    if (target1 != null) estimatedCosts = estimateCosts(costs, entry, target1, quantity);
    if (safeExit != null && safeGrossProfit != null) safeNetProfit = r2(safeGrossProfit - estimateCosts(costs, entry, safeExit, quantity));
    if (target1 != null && target1MaxProfit != null) target1NetProfit = r2(target1MaxProfit - estimateCosts(costs, entry, target1, quantity));
  }

  return {
    direction,
    lotSize,
    lots,
    quantity,
    pointsToEntry,
    safeExit,
    safeProfitPoints,
    safeGrossProfit,
    target1,
    target1ProfitPoints,
    target1MaxProfit,
    stopLoss,
    maxLossPoints,
    maxLoss,
    riskReward,
    costsEnabled,
    estimatedCosts,
    safeNetProfit,
    target1NetProfit,
  };
}

export interface SafeExitInput {
  direction: TradeDirection;
  entry: number;
  target1: number | null;
  atr: number | null;
  resistance1: number | null;
  support1: number | null;
  atrMult: number;
  minSpanFraction: number;
  maxSpanFraction: number;
  structureBufferPct: number;
}

/**
 * Conservative safe-exit LEVEL between entry and Target-1 (books a realistic
 * partial before the full target). Uses the closer of an ATR distance and a
 * chart-structure level in the path, then clamps to
 * [minSpanFraction, maxSpanFraction] × the entry→Target-1 span so it is NEVER
 * beyond Target-1 and never trivially small. Null when there is no room to T1.
 */
export function computeSafeExit(input: SafeExitInput): number | null {
  const { direction, entry, target1, atr, resistance1, support1, atrMult, minSpanFraction, maxSpanFraction, structureBufferPct } = input;
  if (target1 == null) return null;
  const long = direction === "LONG";
  const span = long ? target1 - entry : entry - target1;
  if (!(span > 0)) return null;

  const buffer = (structureBufferPct / 100) * entry;
  const candidates: number[] = [];
  if (atr != null && atr > 0) candidates.push(atrMult * atr);
  if (long && resistance1 != null && resistance1 > entry && resistance1 < target1) candidates.push(resistance1 - buffer - entry);
  if (!long && support1 != null && support1 < entry && support1 > target1) candidates.push(entry - (support1 + buffer));

  const positive = candidates.filter((d) => d > 0);
  let dist = positive.length ? Math.min(...positive) : 0.5 * span;
  dist = Math.min(Math.max(dist, minSpanFraction * span), maxSpanFraction * span);

  return r2(long ? entry + dist : entry - dist);
}
