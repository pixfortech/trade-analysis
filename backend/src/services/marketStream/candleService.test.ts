import { test } from "node:test";
import assert from "node:assert/strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const svc = require("./candleService") as typeof import("./candleService");
import type { Candle } from "./liveCandles";

const MIN = 60_000;
const T0 = Date.UTC(2024, 5, 13, 6, 0, 0);
const TOKEN = 738561;

/** 40 one-minute seed candles ending just before T0. */
function seed(): Candle[] {
  const out: Candle[] = [];
  for (let i = 40; i >= 1; i--) {
    const t = T0 - i * MIN;
    out.push({ t: new Date(t).toISOString(), o: 100, h: 101, l: 99, c: 100, v: 1000 });
  }
  return out;
}

test("cold series (seeded but no ticks) returns null → caller uses REST", () => {
  svc._reset();
  svc.seedSeries(TOKEN, "1minute", seed());
  assert.equal(svc.getLiveCandles(TOKEN, "1minute", T0), null);
  assert.equal(svc.isWarm(TOKEN, "1minute", T0), false);
});

test("a recent tick makes the series WARM and it becomes the candle source", () => {
  svc._reset();
  svc.seedSeries(TOKEN, "1minute", seed());
  svc.onTick(TOKEN, 101.5, T0 + 1_000, 1100);
  const cs = svc.getLiveCandles(TOKEN, "1minute", T0 + 3_000);
  assert.ok(cs, "warm series returned");
  assert.ok(cs!.length >= 40, "includes seeded history + forming candle");
  assert.equal(cs!.at(-1)!.c, 101.5);
  assert.equal(svc.isWarm(TOKEN, "1minute", T0 + 3_000), true);
});

test("a stale gap (last tick beyond candleWarmMs) goes cold again → REST fallback", () => {
  svc._reset();
  svc.seedSeries(TOKEN, "1minute", seed());
  svc.onTick(TOKEN, 101.5, T0 + 1_000, 1100);
  // 60s later with no further tick → beyond the warm window.
  assert.equal(svc.getLiveCandles(TOKEN, "1minute", T0 + 60_000), null);
});

test("one tick feeds every interval series maintained for the token", () => {
  svc._reset();
  svc.seedSeries(TOKEN, "1minute", seed());
  svc.seedSeries(TOKEN, "5minute", seed());
  svc.onTick(TOKEN, 102, T0 + 2_000, 1200);
  assert.equal(svc.getLiveCandles(TOKEN, "1minute", T0 + 3_000)!.at(-1)!.c, 102);
  assert.equal(svc.getLiveCandles(TOKEN, "5minute", T0 + 3_000)!.at(-1)!.c, 102);
});

test("onReconnect drops all series so the next fetch re-seeds from REST (§19)", () => {
  svc._reset();
  svc.seedSeries(TOKEN, "1minute", seed());
  svc.onTick(TOKEN, 101.5, T0 + 1_000, 1100);
  assert.ok(svc.getLiveCandles(TOKEN, "1minute", T0 + 3_000));
  svc.onReconnect();
  assert.equal(svc.getLiveCandles(TOKEN, "1minute", T0 + 3_000), null); // re-seed required
});
