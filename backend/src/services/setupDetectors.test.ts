import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRegime, detectSetups, type DetectorContext } from "./setupDetectors";
import type { Candle } from "./technicalAnalysis";

function ramp(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = o + step;
    out.push({ t: String(i), o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c, v: 1000 });
  }
  return out;
}

function ctx(over: Partial<DetectorContext>): DetectorContext {
  return {
    candles: ramp(60, 100, 1), price: 160, atr: 2, ema20: 155, ema50: 150, trendEma: 150, vwap: 158,
    adx: { adx: 30, plusDI: 30, minusDI: 12 }, supertrend: { value: 150, direction: "bullish" },
    connorsRSI: 50, chandelier: { longStop: 150, shortStop: 170, direction: 1 }, rangeFilter: { dir: "bullish", filt: 155 },
    hacolt: "bullish", volumeConfirmed: true, riskProfile: "balanced", newsShock: false, atrExpansionPct: 5, vixHigh: false,
    ...over,
  };
}

test("regime: strong uptrend when ADX high and EMA/Supertrend/DI aligned up", () => {
  const { regime } = classifyRegime(ctx({ adx: { adx: 40, plusDI: 35, minusDI: 10 } }));
  assert.equal(regime, "STRONG_UPTREND");
});

test("regime: news shock and high volatility take priority", () => {
  assert.equal(classifyRegime(ctx({ newsShock: true })).regime, "NEWS_SHOCK");
  assert.equal(classifyRegime(ctx({ vixHigh: true })).regime, "HIGH_VOLATILITY");
});

test("regime: range when ADX is weak", () => {
  const { regime } = classifyRegime(ctx({ adx: { adx: 12, plusDI: 20, minusDI: 19 }, supertrend: { value: 150, direction: "bullish" }, ema20: 151, ema50: 150, price: 152, vwap: 152 }));
  assert.ok(regime === "RANGE" || regime === "BREAKOUT_ATTEMPT" || regime === "REVERSAL_ATTEMPT");
});

test("detectSetups: Connors long fires oversold-with-trend; secondary ranks last", () => {
  const c = ctx({ connorsRSI: 5, price: 160, trendEma: 150 }); // above trend, deeply oversold
  const setups = detectSetups(c, "UPTREND");
  const connors = setups.find((s) => s.type === "connors-rsi");
  assert.ok(connors, "expected a connors-rsi candidate");
  assert.equal(connors!.direction, "LONG");
  // Range+HACOLT is confirmation-only → flagged secondary and never first.
  const rf = setups.find((s) => s.type === "range-hacolt");
  if (rf) assert.equal(rf.secondary, true);
  assert.ok(!setups[0]?.secondary, "a secondary setup must not rank first");
});

test("detectSetups: breakout is a LONG labelled WAIT FOR BREAKOUT (never for shorts)", () => {
  const setups = detectSetups(ctx({ volumeConfirmed: true }), "BREAKOUT_ATTEMPT");
  const b = setups.find((s) => s.type === "breakout");
  assert.ok(b);
  assert.equal(b!.direction, "LONG");
  assert.equal(b!.label, "WAIT FOR BREAKOUT");
});
