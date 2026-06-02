import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePosition } from "./activeTradeMonitor";
import { buildLiveSignal, type SignalInput } from "./liveSignal";
import type { Candle } from "./technicalAnalysis";

function candles(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = o + step;
    out.push({ t: String(i), o, h: Math.max(o, c) + 2, l: Math.min(o, c) - 2, c, v: 5000 + i * 20 });
  }
  return out;
}

function signal(dir: "up" | "down"): ReturnType<typeof buildLiveSignal> {
  const cs = dir === "up" ? candles(60, 100, 2) : candles(60, 220, -2);
  const inp: SignalInput = {
    instrument: "NFO:TESTFUT",
    quote: {
      lastPrice: cs[cs.length - 1].c,
      open: cs[0].o,
      high: Math.max(...cs.map((c) => c.h)),
      low: Math.min(...cs.map((c) => c.l)),
      previousClose: cs[cs.length - 2].c,
      volume: 5_000_000,
    },
    candles: cs,
    riskProfile: "balanced",
    lotSize: 75,
    timestamp: "",
  };
  return buildLiveSignal(inp);
}

test("LONG position with bullish trend → HOLD/PARTIAL, info severity, P/L signed", () => {
  const s = signal("up");
  const r = evaluatePosition({ positionDirection: "LONG", entryPrice: s.currentPrice - 10, quantity: 75, signal: s });
  assert.ok(["HOLD", "PARTIAL_EXIT"].includes(r.recommendedAction));
  assert.equal(r.alertSeverity, "info");
  // profit since price moved above entry
  assert.ok(r.currentPnL > 0);
  assert.equal(r.currentPnL, Math.round((s.currentPrice - (s.currentPrice - 10)) * 75 * 100) / 100);
});

test("LONG position with bearish trend → reversal detected, exit/tighten", () => {
  const s = signal("down");
  const r = evaluatePosition({ positionDirection: "LONG", entryPrice: s.currentPrice + 20, quantity: 75, signal: s });
  assert.equal(r.currentTrend, "bearish");
  assert.ok(r.trendChangeDetected);
  assert.ok(["EXIT_NOW", "TIGHTEN_SL"].includes(r.recommendedAction));
  assert.ok(["caution", "urgent"].includes(r.alertSeverity));
  // losing position (entry above current in a downtrend)
  assert.ok(r.currentPnL < 0);
});

test("SHORT position with bullish trend → reversal detected against short", () => {
  const s = signal("up");
  const r = evaluatePosition({ positionDirection: "SHORT", entryPrice: s.currentPrice - 20, quantity: 75, signal: s });
  assert.equal(r.currentTrend, "bullish");
  assert.ok(r.trendChangeDetected);
  assert.ok(["EXIT_NOW", "TIGHTEN_SL"].includes(r.recommendedAction));
});

test("re-entry plan only appears when reversal confirmed", () => {
  const aligned = signal("up");
  const ok = evaluatePosition({ positionDirection: "LONG", entryPrice: aligned.currentPrice - 5, quantity: 75, signal: aligned });
  assert.equal(ok.newEntryPlan.direction, "none");

  const against = signal("down");
  const rev = evaluatePosition({ positionDirection: "LONG", entryPrice: against.currentPrice + 20, quantity: 75, signal: against });
  if (rev.trendChangeDetected && against.probability.confidence !== "low") {
    assert.equal(rev.newEntryPlan.direction, "SHORT");
  }
});

test("monitor is read-only and carries a disclaimer", () => {
  const s = signal("up");
  const r = evaluatePosition({ positionDirection: "LONG", entryPrice: 100, quantity: 1, signal: s });
  assert.equal(r.readOnly, true);
  assert.ok(r.disclaimer.length > 0);
});
