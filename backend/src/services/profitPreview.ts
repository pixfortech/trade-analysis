// =====================================================================
// Tentative Profit / Loss preview — PURE, deterministic math.
// ---------------------------------------------------------------------
// Given a LOCKED trade plan (entry / safe-exit / target / stop), the real
// contract lot size, and the number of lots, compute the estimated points and
// rupee outcomes for the safe-exit, Target-1 and stop scenarios. Direction-aware
// (LONG / SHORT). This is an ESTIMATE for planning only — it never places, sizes
// or executes an order, and it is fully decoupled from entry APPROVAL (a preview
// is shown even when entry is not currently approved; the caller labels that).
//
// The money math here is exact and unit-tested to the acceptance numbers. The
// conservative safe-exit LEVEL is derived separately (computeSafeExit) from chart
// structure + ATR and is clamped to never exceed Target-1.
// =====================================================================

export type TradeDirection = "LONG" | "SHORT";

/** Trading-cost model. When disabled, the preview reports GROSS only and never
 *  presents a gross figure as "net". */
export interface CostModel {
  enabled: boolean;
  brokeragePerOrder: number; // ₹ flat per order leg
  orderLegs: number; // entry + exit (typically 2)
  taxesPctOfTurnover: number; // STT + exchange + GST + stamp approximation, % of turnover
}

export interface ProfitPreviewInput {
  direction: TradeDirection;
  cmp: number | null; // live price (may be null before the first tick)
  entry: number; // LOCKED entry
  safeExit: number | null; // conservative safe-exit level (computeSafeExit)
  target1: number | null; // LOCKED Target-1
  stopLoss: number | null; // LOCKED stop
  lotSize: number; // REAL contract lot size from the instrument catalogue
  lots: number; // number of lots
  costs?: CostModel;
}

export interface ProfitPreview {
  direction: TradeDirection;
  lotSize: number;
  lots: number;
  quantity: number; // lotSize × lots
  // Distance to entry (direction-aware: positive = price still has to travel to reach entry).
  pointsToEntry: number | null;
  // Safe-exit scenario.
  safeExit: number | null;
  safeProfitPoints: number | null; // direction-aware, ≥ 0 when safe-exit is favourable
  safeGrossProfit: number | null; // safeProfitPoints × quantity
  // Target-1 scenario.
  target1: number | null;
  target1ProfitPoints: number | null;
  target1MaxProfit: number | null;
  // Stop scenario (loss shown alongside profit).
  stopLoss: number | null;
  maxLossPoints: number | null; // ≥ 0
  maxLoss: number | null; // maxLossPoints × quantity (reported as a positive magnitude)
  // Risk / reward from Target-1 vs stop.
  riskReward: number | null;
  // Costs / net. estimatedCosts is a single representative round-trip estimate
  // (entry → Target-1). Nets are null while the cost engine is disabled.
  costsEnabled: boolean;
  estimatedCosts: number | null;
  safeNetProfit: number | null;
  target1NetProfit: number | null;
}

/** Round to 2 decimals (money / points precision for a preview). */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Directional profit points from `entry` to `level` (positive = in profit). */
function profitPoints(direction: TradeDirection, entry: number, level: number): number {
  return r2(direction === "LONG" ? level - entry : entry - level);
}

/** Round-trip cost estimate for exiting at `exitPrice` from `entry` on `qty` units. */
function estimateCosts(costs: CostModel, entry: number, exitPrice: number, qty: number): number {
  const brokerage = costs.brokeragePerOrder * costs.orderLegs;
  const turnover = (entry + exitPrice) * qty;
  const taxes = (costs.taxesPctOfTurnover / 100) * turnover;
  return r2(brokerage + taxes);
}

/**
 * Compute the Tentative P/L preview. Pure — no I/O, no clock, no order side
 * effects. `quantity = lotSize × lots`. Levels are treated as already LOCKED.
 */
export function computeProfitPreview(input: ProfitPreviewInput): ProfitPreview {
  const { direction, cmp, entry, safeExit, target1, stopLoss, lotSize, lots, costs } = input;
  const quantity = Math.max(0, Math.round(lotSize * lots));

  const pointsToEntry = cmp == null ? null : r2(direction === "LONG" ? entry - cmp : cmp - entry);

  const safeProfitPoints = safeExit == null ? null : profitPoints(direction, entry, safeExit);
  const safeGrossProfit = safeProfitPoints == null ? null : r2(safeProfitPoints * quantity);

  const target1ProfitPoints = target1 == null ? null : profitPoints(direction, entry, target1);
  const target1MaxProfit = target1ProfitPoints == null ? null : r2(target1ProfitPoints * quantity);

  // Loss magnitude at the stop (always reported as a positive number).
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
  resistance1: number | null; // nearest resistance (used for LONG)
  support1: number | null; // nearest support (used for SHORT)
  atrMult: number;
  minSpanFraction: number; // floor as a fraction of the entry→T1 span
  maxSpanFraction: number; // cap as a fraction of the entry→T1 span (< 1 → never at/over T1)
  structureBufferPct: number; // % of price kept before an S/R level
}

/**
 * Derive a CONSERVATIVE safe-exit level between entry and Target-1. It books a
 * realistic partial before the full target, using the closer of an ATR-based
 * distance and the nearest chart-structure level in the path — then clamps the
 * distance to [minSpanFraction, maxSpanFraction] × the entry→Target-1 span so the
 * safe-exit is NEVER beyond Target-1 (long) / below Target-1 (short) and never
 * trivially small. Returns null when there is no positive room to Target-1.
 */
export function computeSafeExit(input: SafeExitInput): number | null {
  const { direction, entry, target1, atr, resistance1, support1, atrMult, minSpanFraction, maxSpanFraction, structureBufferPct } = input;
  if (target1 == null) return null;
  const long = direction === "LONG";
  const span = long ? target1 - entry : entry - target1;
  if (!(span > 0)) return null; // target must be in the trade direction

  const buffer = (structureBufferPct / 100) * entry;
  const candidates: number[] = [];
  if (atr != null && atr > 0) candidates.push(atrMult * atr);
  // Structure level strictly between entry and target, pulled in by a buffer.
  if (long && resistance1 != null && resistance1 > entry && resistance1 < target1) candidates.push(resistance1 - buffer - entry);
  if (!long && support1 != null && support1 < entry && support1 > target1) candidates.push(entry - (support1 + buffer));

  const positive = candidates.filter((d) => d > 0);
  let dist = positive.length ? Math.min(...positive) : 0.5 * span; // most conservative (books soonest)
  const floor = minSpanFraction * span;
  const cap = maxSpanFraction * span;
  dist = Math.min(Math.max(dist, floor), cap);

  return r2(long ? entry + dist : entry - dist);
}
