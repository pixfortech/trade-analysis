import { test } from "node:test";
import assert from "node:assert/strict";

import { computeProfitPreview, computeSafeExit, type CostModel } from "./profitPreview";

const NO_COSTS: CostModel = { enabled: false, brokeragePerOrder: 20, orderLegs: 2, taxesPctOfTurnover: 0.05 };

// ---------------------------------------------------------------------------
// Acceptance — LONG. CMP 310, entry 315.50, safe-exit 319.60, T1 323.85,
// stop 312, lot 120, 1 lot → 5.50 pts to entry, safe 4.10 pts / ₹492,
// T1 8.35 pts / ₹1002, max loss 3.50 pts / ₹420.
// ---------------------------------------------------------------------------
test("LONG preview matches the acceptance numbers exactly", () => {
  const p = computeProfitPreview({
    direction: "LONG",
    cmp: 310,
    entry: 315.5,
    safeExit: 319.6,
    target1: 323.85,
    stopLoss: 312,
    lotSize: 120,
    lots: 1,
    costs: NO_COSTS,
  });

  assert.equal(p.quantity, 120);
  assert.equal(p.pointsToEntry, 5.5); // entry − cmp (CMP is below entry)
  assert.equal(p.safeProfitPoints, 4.1); // safeExit − entry
  assert.equal(p.safeGrossProfit, 492); // 4.10 × 120
  assert.equal(p.target1ProfitPoints, 8.35); // T1 − entry
  assert.equal(p.target1MaxProfit, 1002); // 8.35 × 120
  assert.equal(p.maxLossPoints, 3.5); // entry − stop
  assert.equal(p.maxLoss, 420); // 3.50 × 120
  assert.equal(p.riskReward, 2.39); // 8.35 / 3.50
  // Costs disabled → GROSS only; nets stay unavailable (never call gross "net").
  assert.equal(p.costsEnabled, false);
  assert.equal(p.estimatedCosts, null);
  assert.equal(p.safeNetProfit, null);
  assert.equal(p.target1NetProfit, null);
});

// ---------------------------------------------------------------------------
// Acceptance — SHORT. entry 315.50, safe-exit 311.40, T1 307.15, stop 319,
// lot 120 → safe 4.10 pts / ₹492, T1 8.35 pts / ₹1002, risk 3.50 pts / ₹420.
// ---------------------------------------------------------------------------
test("SHORT preview matches the acceptance numbers exactly", () => {
  const p = computeProfitPreview({
    direction: "SHORT",
    cmp: 320,
    entry: 315.5,
    safeExit: 311.4,
    target1: 307.15,
    stopLoss: 319,
    lotSize: 120,
    lots: 1,
    costs: NO_COSTS,
  });

  assert.equal(p.quantity, 120);
  assert.equal(p.pointsToEntry, 4.5); // cmp − entry (CMP above entry for a short)
  assert.equal(p.safeProfitPoints, 4.1); // entry − safeExit
  assert.equal(p.safeGrossProfit, 492);
  assert.equal(p.target1ProfitPoints, 8.35); // entry − T1
  assert.equal(p.target1MaxProfit, 1002);
  assert.equal(p.maxLossPoints, 3.5); // stop − entry
  assert.equal(p.maxLoss, 420);
  assert.equal(p.riskReward, 2.39);
});

test("quantity scales with lots", () => {
  const p = computeProfitPreview({ direction: "LONG", cmp: 310, entry: 315.5, safeExit: 319.6, target1: 323.85, stopLoss: 312, lotSize: 120, lots: 3 });
  assert.equal(p.quantity, 360);
  assert.equal(p.safeGrossProfit, 1476); // 4.10 × 360
  assert.equal(p.target1MaxProfit, 3006); // 8.35 × 360
  assert.equal(p.maxLoss, 1260); // 3.50 × 360
});

test("net profit is computed only when the cost engine is enabled", () => {
  const costs: CostModel = { enabled: true, brokeragePerOrder: 20, orderLegs: 2, taxesPctOfTurnover: 0.05 };
  const p = computeProfitPreview({ direction: "LONG", cmp: 310, entry: 315.5, safeExit: 319.6, target1: 323.85, stopLoss: 312, lotSize: 120, lots: 1, costs });
  assert.equal(p.costsEnabled, true);
  assert.ok(p.estimatedCosts != null && p.estimatedCosts > 0);
  // Net is strictly below gross once costs are deducted.
  assert.ok(p.target1NetProfit != null && p.target1NetProfit < p.target1MaxProfit!);
  assert.ok(p.safeNetProfit != null && p.safeNetProfit < p.safeGrossProfit!);
});

test("missing live cmp leaves pointsToEntry null but keeps the locked-level math", () => {
  const p = computeProfitPreview({ direction: "LONG", cmp: null, entry: 315.5, safeExit: 319.6, target1: 323.85, stopLoss: 312, lotSize: 120, lots: 1 });
  assert.equal(p.pointsToEntry, null);
  assert.equal(p.target1MaxProfit, 1002);
  assert.equal(p.maxLoss, 420);
});

// ---------------------------------------------------------------------------
// Safe-exit derivation — conservative and clamped to never exceed Target-1.
// ---------------------------------------------------------------------------
test("safe-exit stays strictly between entry and Target-1 (LONG)", () => {
  const se = computeSafeExit({ direction: "LONG", entry: 315.5, target1: 323.85, atr: 50, resistance1: null, support1: null, atrMult: 1, minSpanFraction: 0.25, maxSpanFraction: 0.95, structureBufferPct: 0.05 });
  assert.ok(se != null);
  assert.ok(se! > 315.5, "above entry");
  assert.ok(se! < 323.85, "never beyond Target-1"); // large ATR is capped by maxSpanFraction
});

test("safe-exit honours a nearby resistance in the path (LONG)", () => {
  const se = computeSafeExit({ direction: "LONG", entry: 315.5, target1: 323.85, atr: null, resistance1: 319, support1: null, atrMult: 1, minSpanFraction: 0.1, maxSpanFraction: 0.95, structureBufferPct: 0 });
  // resistance at 319 (< T1) → safe-exit books at ~319, below Target-1.
  assert.ok(se != null && se! <= 319 && se! < 323.85);
});

test("safe-exit is null when Target-1 is not in the trade direction", () => {
  const se = computeSafeExit({ direction: "LONG", entry: 315.5, target1: 314, atr: 5, resistance1: null, support1: null, atrMult: 1, minSpanFraction: 0.25, maxSpanFraction: 0.95, structureBufferPct: 0.05 });
  assert.equal(se, null);
});

test("safe-exit mirrors for SHORT (below entry, above Target-1)", () => {
  const se = computeSafeExit({ direction: "SHORT", entry: 315.5, target1: 307.15, atr: 40, resistance1: null, support1: null, atrMult: 1, minSpanFraction: 0.25, maxSpanFraction: 0.95, structureBufferPct: 0.05 });
  assert.ok(se != null && se! < 315.5 && se! > 307.15);
});
