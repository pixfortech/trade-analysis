import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiveSignal, type SignalInput } from "./liveSignal";
import type { Candle } from "./technicalAnalysis";

// Candles with an up-drift but asymmetric wicks so swing low ≠ swing high
// distance from entries → long & short risk differ.
function candles(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = o + step;
    const h = Math.max(o, c) + 3;
    const l = Math.min(o, c) - 1.5;
    out.push({ t: String(i), o, h, l, c, v: 1000 + i * 7 });
  }
  return out;
}

function inp(over: Partial<SignalInput> = {}): SignalInput {
  const cs = candles(60, 100, 1.4);
  return {
    instrument: "NFO:TESTFUT",
    quote: { lastPrice: cs[cs.length - 1].c, open: 100, high: cs[cs.length - 1].c + 2, low: 98, previousClose: cs[cs.length - 2].c, volume: 5_000_000 },
    candles: cs,
    riskProfile: "balanced",
    lotSize: 75,
    timestamp: "",
    ...over,
  };
}

test("Phase 3F: long and short P/L are calculated SEPARATELY (not identical)", () => {
  const s = buildLiveSignal(inp());
  // Distances should differ because long SL uses swing low, short SL swing high.
  const sameRisk = s.longSetup.riskPerUnit === s.shortSetup.riskPerUnit;
  const samePL =
    s.longSetup.estimatedProfitForOneLot === s.shortSetup.estimatedProfitForOneLot &&
    s.longSetup.estimatedLossForOneLot === s.shortSetup.estimatedLossForOneLot;
  assert.ok(!(sameRisk && samePL), "long & short must not share one placeholder P/L");
});

test("long P/L uses (target-entry) and (entry-SL); short uses the mirror", () => {
  const s = buildLiveSignal(inp());
  const L = s.longSetup;
  assert.equal(L.estimatedProfitForOneLot, Math.round((L.target2 - L.entryAbove!) * L.quantity * 100) / 100);
  assert.equal(L.estimatedLossForOneLot, Math.round((L.entryAbove! - L.stopLoss) * L.quantity * 100) / 100);
  const S = s.shortSetup;
  assert.equal(S.estimatedProfitForOneLot, Math.round((S.entryBelow! - S.target2) * S.quantity * 100) / 100);
  assert.equal(S.estimatedLossForOneLot, Math.round((S.stopLoss - S.entryBelow!) * S.quantity * 100) / 100);
});

test("long SL below long entry; short SL above short entry", () => {
  const s = buildLiveSignal(inp());
  assert.ok(s.longSetup.stopLoss < s.longSetup.entryAbove!);
  assert.ok(s.shortSetup.stopLoss > s.shortSetup.entryBelow!);
});

test("quantity overrides lotSize for P/L", () => {
  const a = buildLiveSignal(inp({ quantity: 10 }));
  assert.equal(a.longSetup.quantity, 10);
  // profit scales with quantity
  const perUnit = a.longSetup.target2 - a.longSetup.entryAbove!;
  assert.equal(a.longSetup.estimatedProfitForOneLot, Math.round(perUnit * 10 * 100) / 100);
});

test("estimated win % stays within the conservative 35..75 band", () => {
  const s = buildLiveSignal(inp());
  assert.ok(s.probability.estimatedWinPercent >= 35 && s.probability.estimatedWinPercent <= 75);
});
