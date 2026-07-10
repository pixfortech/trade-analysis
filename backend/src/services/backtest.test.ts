import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateTrades, computeMetrics, connorsSignals, type EntrySignal } from "./backtest";
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

test("simulateTrades: a long into a rising market hits its target (+R)", () => {
  const candles = ramp(40, 100, 1); // steadily rising
  const sig: EntrySignal = { idx: 0, direction: "LONG", entry: 101, stop: 99, target: 105 };
  const trades = simulateTrades(candles, sig ? [sig] : []);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].win, true);
  assert.ok(trades[0].rMultiple > 0);
});

test("simulateTrades: a long into a falling market hits its stop (−R)", () => {
  const candles = ramp(40, 100, -1); // steadily falling
  const trades = simulateTrades(candles, [{ idx: 0, direction: "LONG", entry: 99, stop: 97, target: 105 }]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].win, false);
  assert.ok(trades[0].rMultiple < 0);
});

test("computeMetrics: reports honest stats + sample-size guard", () => {
  const candlesUp = ramp(40, 100, 1);
  const candlesDown = ramp(40, 100, -1);
  const trades = [
    ...simulateTrades(candlesUp, [{ idx: 0, direction: "LONG", entry: 101, stop: 99, target: 105 }]),
    ...simulateTrades(candlesDown, [{ idx: 0, direction: "LONG", entry: 99, stop: 97, target: 105 }]),
  ];
  const m = computeMetrics(trades, "test", 30);
  assert.equal(m.trades, 2);
  assert.equal(m.wins, 1);
  assert.equal(m.losses, 1);
  assert.equal(m.winRate, 50);
  assert.equal(m.sufficientSample, false); // 2 < 30 → must warn, never tune on this
  assert.ok(m.note.length > 0);
});

test("connorsSignals runs over synthetic candles and returns valid signals", () => {
  const candles = [...ramp(60, 200, -1), ...ramp(30, 140, 2)]; // drop then recover
  const sigs = connorsSignals(candles, { rsiPeriod: 3, streakRsiPeriod: 2, rankPeriod: 20, oversold: 20, overbought: 80, trendEmaPeriod: 20 }, 1.5, 2);
  for (const s of sigs) {
    assert.ok(s.direction === "LONG" || s.direction === "SHORT");
    assert.ok(Math.abs(s.entry - s.stop) > 0);
    assert.ok(s.idx >= 0 && s.idx < candles.length - 1);
  }
});
