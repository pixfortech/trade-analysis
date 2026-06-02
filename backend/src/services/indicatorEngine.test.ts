import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adx,
  buildContributions,
  computeIndicators,
  parseActiveIndicators,
  supertrend,
  type IndicatorId,
} from "./indicatorEngine";
import type { Candle } from "./technicalAnalysis";

function trend(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const o = c;
    c = o + step;
    out.push({ t: String(i), o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 1000 + i });
  }
  return out;
}

test("parseActiveIndicators: defaults, filtering, dedupe", () => {
  assert.ok(parseActiveIndicators(undefined).includes("VWAP"));
  assert.deepEqual(parseActiveIndicators("EMA20,EMA20,RSI,BOGUS"), ["EMA20", "RSI"]);
  // all-invalid falls back to defaults
  assert.ok(parseActiveIndicators("NOPE").length > 1);
});

test("ADX and Supertrend compute on a trend", () => {
  const up = trend(80, 100, 1.5);
  const a = adx(up, 14);
  assert.ok(a && a.adx >= 0 && a.plusDI >= 0 && a.minusDI >= 0);
  const st = supertrend(up, 10, 3);
  assert.ok(st && st.direction === "bullish");
});

test("contributions only count ACTIVE indicators", () => {
  const up = trend(80, 100, 1.5);
  const v = computeIndicators(up);
  const price = up[up.length - 1].c;

  const all = buildContributions(price, v, parseActiveIndicators(undefined));
  const justRsi = buildContributions(price, v, ["RSI"] as IndicatorId[]);

  assert.ok(all.contributions.length > justRsi.contributions.length);
  assert.equal(justRsi.contributions.length, 1);
  assert.equal(justRsi.contributions[0].id, "RSI");
});

test("disabling an indicator changes the bullish/bearish totals", () => {
  const up = trend(80, 100, 1.5);
  const v = computeIndicators(up);
  const price = up[up.length - 1].c;

  const withSt = buildContributions(price, v, ["EMA20", "SUPERTREND"] as IndicatorId[]);
  const withoutSt = buildContributions(price, v, ["EMA20"] as IndicatorId[]);
  // Supertrend carries weight 2 → removing it must lower bullish total in an uptrend.
  assert.ok(withSt.bullish > withoutSt.bullish);
});

test("ATR and VOLUME are non-directional (weight 0)", () => {
  const up = trend(80, 100, 1.5);
  const v = computeIndicators(up);
  const c = buildContributions(up[up.length - 1].c, v, ["ATR", "VOLUME"] as IndicatorId[]);
  assert.ok(c.bullish === 0 && c.bearish === 0);
});

test("insufficient data marks indicators unavailable (missing)", () => {
  const few = trend(5, 100, 1);
  const v = computeIndicators(few);
  const c = buildContributions(few[few.length - 1].c, v, parseActiveIndicators(undefined));
  assert.ok(c.missing.length > 0);
});
