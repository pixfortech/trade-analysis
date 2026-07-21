import { test } from "node:test";
import assert from "node:assert/strict";

import { LiveCandleSeries, type Candle } from "./liveCandles";

const MIN = 60_000;
const T0 = Date.UTC(2024, 5, 13, 9, 30, 0); // an arbitrary fixed boundary

function seedCandles(): Candle[] {
  return [
    { t: new Date(T0 - 2 * MIN).toISOString(), o: 100, h: 101, l: 99, c: 100.5, v: 1000 },
    { t: new Date(T0 - 1 * MIN).toISOString(), o: 100.5, h: 102, l: 100, c: 101.5, v: 1200 },
  ];
}

test("seeds finalised history from REST", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(seedCandles());
  assert.equal(s.isSeeded(), true);
  assert.equal(s.candles().length, 2);
  assert.equal(s.size(), 2);
});

test("first tick opens a forming candle at the interval boundary", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(seedCandles());
  s.onTick(T0 + 5_000, 101.6, 1300); // 5s into the T0 candle
  const cs = s.candles();
  assert.equal(cs.length, 3); // 2 history + 1 forming
  const f = cs[2];
  assert.equal(Date.parse(f.t), T0);
  assert.deepEqual([f.o, f.h, f.l, f.c], [101.6, 101.6, 101.6, 101.6]);
  assert.equal(f.v, 0); // first tick: startCum captured, delta 0
  assert.equal(s.formingBoundaryMs(), T0);
});

test("subsequent ticks update H/L/C and accumulate volume within the candle", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(seedCandles());
  s.onTick(T0 + 1_000, 101.6, 1300);
  s.onTick(T0 + 10_000, 102.4, 1500); // new high
  s.onTick(T0 + 20_000, 101.2, 1800); // new low, close
  const f = s.candles().at(-1)!;
  assert.equal(f.o, 101.6);
  assert.equal(f.h, 102.4);
  assert.equal(f.l, 101.2);
  assert.equal(f.c, 101.2);
  assert.equal(f.v, 500); // 1800 − 1300 cumulative
});

test("at the boundary the candle finalises automatically and the next one opens", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(seedCandles());
  s.onTick(T0 + 30_000, 101.6, 1300);
  s.onTick(T0 + 55_000, 102.0, 1600); // still in T0 candle
  s.onTick(T0 + MIN + 2_000, 102.1, 1650); // crosses into the next candle
  const cs = s.candles();
  // 2 seed + finalised T0 + forming T0+1min = 4
  assert.equal(cs.length, 4);
  const finalisedT0 = cs[2];
  assert.equal(Date.parse(finalisedT0.t), T0);
  assert.equal(finalisedT0.c, 102.0); // last price before rollover
  assert.equal(finalisedT0.v, 300); // 1600 − 1300
  const next = cs[3];
  assert.equal(Date.parse(next.t), T0 + MIN);
  assert.equal(next.o, 102.1);
});

test("index ticks (no cumulative volume) build candles with v = 0", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed([]);
  s.onTick(T0 + 1_000, 22045.3);
  s.onTick(T0 + 2_000, 22050.1);
  const f = s.candles().at(-1)!;
  assert.equal(f.h, 22050.1);
  assert.equal(f.v, 0);
});

test("isWarm reflects recent ticks (series is the source) vs a cold gap (fall back to REST)", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(seedCandles());
  assert.equal(s.isWarm(15_000, T0), false); // seeded but no ticks yet
  s.onTick(T0 + 1_000, 101.6, 1300);
  assert.equal(s.isWarm(15_000, T0 + 5_000), true); // tick 4s ago
  assert.equal(s.isWarm(15_000, T0 + 30_000), false); // last tick 29s ago → cold
});

test("re-seed after a reconnect gap replaces history and drops the partial candle", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(seedCandles());
  s.onTick(T0 + 1_000, 101.6, 1300);
  assert.equal(s.formingBoundaryMs(), T0);
  // Reconnect: fresh REST fetch that already includes the gap-filled candles.
  s.seed([
    { t: new Date(T0).toISOString(), o: 101.6, h: 103, l: 101, c: 102.8, v: 5000 },
    { t: new Date(T0 + MIN).toISOString(), o: 102.8, h: 104, l: 102, c: 103.5, v: 4200 },
  ]);
  assert.equal(s.formingBoundaryMs(), null); // partial dropped
  assert.equal(s.candles().length, 2);
  // Ticks resume building from the new baseline.
  s.onTick(T0 + 2 * MIN + 1_000, 103.6, 100);
  assert.equal(s.candles().length, 3);
});

test("out-of-order (older) ticks are ignored", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(seedCandles());
  s.onTick(T0 + MIN + 5_000, 103, 100); // opens T0+1min candle
  s.onTick(T0 + 10_000, 999, 100); // stale tick from the previous candle → ignored
  const f = s.candles().at(-1)!;
  assert.equal(Date.parse(f.t), T0 + MIN);
  assert.notEqual(f.h, 999);
});
