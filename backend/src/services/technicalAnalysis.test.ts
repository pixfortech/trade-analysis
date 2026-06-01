import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveTradePlan,
  RISK_DISCLAIMER,
  type Candle,
  type QuoteSnapshot,
} from "./technicalAnalysis";

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

function quoteFrom(candles: Candle[], lastPrice: number): QuoteSnapshot {
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  return {
    lastPrice,
    open: candles[candles.length - 1].o,
    high: Math.max(...highs.slice(-1), lastPrice),
    low: Math.min(...lows.slice(-1), lastPrice),
    previousClose: candles[candles.length - 2].c,
    volume: 50000,
  };
}

test("every plan carries the risk disclaimer and read-only flags", () => {
  const candles = makeCandles(100, 1);
  const r = buildLiveTradePlan({
    instrument: "NSE:TEST",
    quote: quoteFrom(candles, 161),
    candles,
    riskProfile: "balanced",
    timestamp: new Date().toISOString(),
  });
  assert.equal(r.riskDisclaimer, RISK_DISCLAIMER);
  assert.equal(r.readOnly, true);
  assert.equal(r.live, true);
  assert.equal(r.source, "kite");
});

test("long plan: stop-loss below entry, targets strictly increasing", () => {
  const candles = makeCandles(100, 1.5); // steady uptrend
  const r = buildLiveTradePlan({
    instrument: "NSE:UP",
    quote: quoteFrom(candles, candles[candles.length - 1].c),
    candles,
    riskProfile: "balanced",
    timestamp: new Date().toISOString(),
  });
  const lp = r.longPlan;
  assert.ok(lp.entryAbove != null && lp.stopLoss < lp.entryAbove, "SL must be below entry");
  assert.ok(lp.target1 > lp.entryAbove!, "T1 above entry");
  assert.ok(lp.target2 > lp.target1 && lp.target3 > lp.target2, "targets increasing");
});

test("short plan: stop-loss above entry, targets strictly decreasing", () => {
  const candles = makeCandles(200, -1.5); // steady downtrend
  const r = buildLiveTradePlan({
    instrument: "NSE:DOWN",
    quote: quoteFrom(candles, candles[candles.length - 1].c),
    candles,
    riskProfile: "balanced",
    timestamp: new Date().toISOString(),
  });
  const sp = r.shortPlan;
  assert.ok(sp.entryBelow != null && sp.stopLoss > sp.entryBelow, "SL must be above entry");
  assert.ok(sp.target1 < sp.entryBelow!, "T1 below entry");
  assert.ok(sp.target2 < sp.target1 && sp.target3 < sp.target2, "targets decreasing");
});

test("uptrend yields a bullish/long bias", () => {
  const candles = makeCandles(100, 2);
  const r = buildLiveTradePlan({
    instrument: "NSE:UP",
    quote: quoteFrom(candles, candles[candles.length - 1].c + 1),
    candles,
    riskProfile: "aggressive",
    timestamp: new Date().toISOString(),
  });
  assert.equal(r.trend.direction, "bullish");
  assert.ok(["LONG", "RANGE-BOUND", "WAIT"].includes(r.finalDecision.action));
  if (r.finalDecision.action === "LONG") assert.notEqual(r.finalDecision.confidence, "low");
});

test("quote-only (no candles) → low confidence, WAIT/AVOID, indicators null", () => {
  const quote: QuoteSnapshot = {
    lastPrice: 150,
    open: 148,
    high: 152,
    low: 147,
    previousClose: 149,
    volume: 12345,
  };
  const r = buildLiveTradePlan({
    instrument: "NSE:QONLY",
    quote,
    candles: null,
    riskProfile: "balanced",
    timestamp: new Date().toISOString(),
  });
  assert.equal(r.dataQuality, "live-quote-only");
  assert.equal(r.indicators.ema9, null);
  assert.equal(r.indicators.rsi, null);
  assert.equal(r.indicators.atr, null);
  assert.notEqual(r.finalDecision.confidence, "high");
  assert.ok(["WAIT", "AVOID", "RANGE-BOUND"].includes(r.finalDecision.action));
  assert.ok(/quote/i.test(r.dataNote));
});

test("degenerate data (flat, no range) → AVOID", () => {
  const quote: QuoteSnapshot = {
    lastPrice: 100,
    open: 100,
    high: 100,
    low: 100,
    previousClose: 100,
    volume: 0,
  };
  const r = buildLiveTradePlan({
    instrument: "NSE:FLAT",
    quote,
    candles: null,
    riskProfile: "balanced",
    timestamp: new Date().toISOString(),
  });
  assert.equal(r.finalDecision.action, "AVOID");
  assert.equal(r.finalDecision.confidence, "low");
});

test("risk profile affects stop distance (conservative wider than aggressive)", () => {
  const candles = makeCandles(100, 1.2);
  const q = quoteFrom(candles, candles[candles.length - 1].c);
  const cons = buildLiveTradePlan({ instrument: "X", quote: q, candles, riskProfile: "conservative", timestamp: "t" });
  const aggr = buildLiveTradePlan({ instrument: "X", quote: q, candles, riskProfile: "aggressive", timestamp: "t" });
  const consDist = cons.longPlan.entryAbove! - cons.longPlan.stopLoss;
  const aggrDist = aggr.longPlan.entryAbove! - aggr.longPlan.stopLoss;
  assert.ok(consDist > aggrDist, "conservative SL should be wider than aggressive");
});
