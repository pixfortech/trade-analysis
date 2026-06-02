import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLiveSignal, SIGNAL_DISCLAIMER, type SignalInput } from "./liveSignal";
import type { Candle } from "./technicalAnalysis";

function makeCandles(start: number, step: number, n = 60): Candle[] {
  const out: Candle[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = o + step;
    const h = Math.max(o, c) + Math.abs(step) * 0.5 + 1;
    const l = Math.min(o, c) - Math.abs(step) * 0.5 - 1;
    out.push({ t: `${i}`, o, h, l, c, v: 1000 + i * 10 });
  }
  return out;
}

function input(candles: Candle[] | null, lastPrice: number, lotSize: number | null = 50): SignalInput {
  const hi = candles ? Math.max(...candles.slice(-1).map((c) => c.h), lastPrice) : lastPrice + 2;
  const lo = candles ? Math.min(...candles.slice(-1).map((c) => c.l), lastPrice) : lastPrice - 2;
  return {
    instrument: "NSE:TEST",
    quote: { lastPrice, open: lastPrice - 1, high: hi, low: lo, previousClose: lastPrice - 2, volume: 50000 },
    candles,
    riskProfile: "balanced",
    lotSize,
    timestamp: new Date().toISOString(),
  };
}

test("always read-only with disclaimer", () => {
  const s = buildLiveSignal(input(makeCandles(100, 1), 161));
  assert.equal(s.readOnly, true);
  assert.equal(s.disclaimer, SIGNAL_DISCLAIMER);
  assert.equal(s.source, "kite");
});

test("bullish + bearish probabilities total ~100", () => {
  const s = buildLiveSignal(input(makeCandles(100, 1.5), 175));
  assert.ok(Math.abs(s.probability.bullishPercent + s.probability.bearishPercent - 100) < 0.5);
});

test("uptrend → bullish bias, LONG setup active, long SL below entry", () => {
  const candles = makeCandles(100, 2);
  const s = buildLiveSignal(input(candles, candles[candles.length - 1].c + 1));
  assert.equal(s.trend.direction, "bullish");
  assert.ok(s.probability.bullishPercent > 50);
  assert.ok(s.longSetup.entryAbove != null && s.longSetup.stopLoss < s.longSetup.entryAbove);
  assert.ok(s.longSetup.target1 > s.longSetup.entryAbove! && s.longSetup.target3 > s.longSetup.target2);
});

test("downtrend → bearish bias, short SL above entry", () => {
  const candles = makeCandles(300, -2);
  const s = buildLiveSignal(input(candles, candles[candles.length - 1].c - 1));
  assert.equal(s.trend.direction, "bearish");
  assert.ok(s.probability.bearishPercent > 50);
  assert.ok(s.shortSetup.entryBelow != null && s.shortSetup.stopLoss > s.shortSetup.entryBelow);
});

test("estimated win % is capped at 80 and never absurd", () => {
  const s = buildLiveSignal(input(makeCandles(100, 3), 300));
  // Phase 3F conservative band: 35..75.
  assert.ok(s.probability.estimatedWinPercent <= 75);
  assert.ok(s.probability.estimatedWinPercent >= 35);
});

test("quote-only → low confidence, WAIT, indicators null, win% capped (Phase 3F ≤55)", () => {
  const s = buildLiveSignal(input(null, 150));
  assert.equal(s.probability.dataQuality, "quote-only");
  assert.equal(s.probability.confidence, "low");
  assert.equal(s.indicators.ema9, null);
  assert.equal(s.finalDecision.action, "WAIT");
  // Phase 3F: poor data quality caps the win estimate at 55 (was 45 in 3E).
  assert.ok(s.probability.estimatedWinPercent <= 55);
});

test("estimated P/L for one lot uses lot size", () => {
  const s = buildLiveSignal(input(makeCandles(100, 1.5), 170, 75));
  // profit = rewardPerUnit * lot; loss = riskPerUnit * lot
  assert.ok(s.longSetup.estimatedProfitForOneLot > 0);
  assert.ok(s.longSetup.estimatedLossForOneLot > 0);
  assert.equal(
    s.longSetup.estimatedLossForOneLot,
    Math.round(s.longSetup.riskPerUnit * 75 * 100) / 100,
  );
});

test("degenerate (flat) data → AVOID", () => {
  const flat: SignalInput = {
    instrument: "NSE:FLAT",
    quote: { lastPrice: 100, open: 100, high: 100, low: 100, previousClose: 100, volume: 0 },
    candles: null,
    riskProfile: "balanced",
    lotSize: 1,
    timestamp: new Date().toISOString(),
  };
  const s = buildLiveSignal(flat);
  assert.equal(s.finalDecision.action, "AVOID");
  assert.equal(s.probability.confidence, "low");
});

test("final decision never LONG/SHORT on low confidence", () => {
  const s = buildLiveSignal(input(null, 150));
  assert.ok(!["LONG", "SHORT"].includes(s.finalDecision.action));
});
