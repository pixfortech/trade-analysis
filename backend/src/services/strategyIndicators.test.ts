import { test } from "node:test";
import assert from "node:assert/strict";
import { connorsRSI, chandelierExit, rangeFilter, hacolt, rsiSeries, streakSeries } from "./strategyIndicators";
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

test("connorsRSI: null on short data, bounded 0–100 otherwise", () => {
  const cfg = { rsiPeriod: 3, streakRsiPeriod: 2, rankPeriod: 20 };
  assert.equal(connorsRSI([1, 2, 3], cfg), null);
  const up = ramp(60, 100, 1).map((c) => c.c);
  const v = connorsRSI(up, cfg);
  assert.ok(v != null);
  assert.ok(v! >= 0 && v! <= 100, `expected 0–100, got ${v}`);
});

test("chandelierExit: long on a sustained uptrend, short on a downtrend", () => {
  const cfg = { atrPeriod: 22, atrMult: 3, useClose: true };
  const upTrend = chandelierExit(ramp(80, 100, 1), cfg);
  const downTrend = chandelierExit(ramp(80, 200, -1), cfg);
  assert.ok(upTrend && downTrend);
  assert.equal(upTrend!.direction, 1);
  assert.equal(downTrend!.direction, -1);
  assert.ok(upTrend!.longStop < 180); // stop below price on an uptrend
});

test("rangeFilter + hacolt agree with trend direction", () => {
  const upCloses = ramp(60, 100, 1).map((c) => c.c);
  const rf = rangeFilter(upCloses, { period: 20, mult: 3 });
  assert.equal(rf?.dir, "bullish");
  assert.equal(hacolt(ramp(80, 100, 1), 55), "bullish");
  assert.equal(hacolt(ramp(80, 300, -1), 55), "bearish");
});

test("rsiSeries → ~100 on monotonic gains; streakSeries counts runs", () => {
  const rs = rsiSeries([1, 2, 3, 4, 5, 6, 7, 8], 3);
  assert.equal(rs[7], 100);
  assert.deepEqual(streakSeries([10, 11, 12, 11, 10, 10, 11]), [0, 1, 2, -1, -2, 0, 1]);
});
