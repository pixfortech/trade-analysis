import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChartData } from "./chartData";
import type { Candle } from "./technicalAnalysis";
import type { IndicatorId } from "./indicatorEngine";

function candles(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = o + step;
    out.push({ t: `2026-06-01T${String(i % 24).padStart(2, "0")}:00:00Z`, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 1000 + i });
  }
  return out;
}

test("returns candles + only the requested overlays/oscillators", () => {
  const cs = candles(80, 100, 1.2);
  const active: IndicatorId[] = ["VWAP", "EMA20", "RSI"];
  const d = buildChartData(cs, active, { high: 130, low: 90, close: 120 }, "2026-06-01T10:00:00Z");
  assert.equal(d.candles.length, 80);
  assert.ok(d.overlays.VWAP && d.overlays.EMA20);
  assert.ok(!d.overlays.EMA50, "EMA50 not requested → absent");
  assert.ok(d.oscillators.RSI);
  assert.ok(!d.oscillators.MACD_HIST, "MACD not requested → absent");
});

test("CPR/pivot levels come from previous-day H/L/C", () => {
  const cs = candles(40, 100, 1);
  const d = buildChartData(cs, ["VWAP"], { high: 130, low: 90, close: 120 }, "t");
  assert.ok(d.levels.pivot != null && d.levels.r1 != null && d.levels.s1 != null);
  assert.equal(d.levels.prevHigh, 130);
});

test("levels are null when no previous day is supplied", () => {
  const cs = candles(40, 100, 1);
  const d = buildChartData(cs, ["EMA20"], null, "t");
  assert.equal(d.levels.pivot, null);
  assert.equal(d.levels.prevHigh, null);
});

test("EMA50 overlay present only with enough candles", () => {
  const cs = candles(60, 100, 1);
  const d = buildChartData(cs, ["EMA50"], null, "t");
  assert.ok(d.overlays.EMA50 && d.overlays.EMA50.length > 0);
});
