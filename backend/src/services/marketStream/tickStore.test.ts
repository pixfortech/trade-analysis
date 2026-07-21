import { test } from "node:test";
import assert from "node:assert/strict";

import { TickStore } from "./tickStore";
import type { Tick } from "./kiteBinary";

function tick(token: number, ltp: number, exchangeTimestampMs: number | null = null): Tick {
  return { token, ltp, mode: "full", isIndex: false, ohlc: null, change: null, volume: null, oi: null, exchangeTimestampMs, lastTradeTimeMs: null };
}

test("stores the latest tick per token and returns it with the receipt instant", () => {
  const s = new TickStore();
  s.set(tick(1, 100), 1_000);
  s.set(tick(1, 101), 2_000); // newer wins
  s.set(tick(2, 50), 1_500);
  assert.equal(s.get(1)?.ltp, 101);
  assert.equal(s.get(1)?.receivedAtMs, 2_000);
  assert.deepEqual(s.getMany([1, 2, 3]).map((t) => t.ltp), [101, 50]); // missing token skipped
  assert.equal(s.size(), 2);
});

test("freshness uses the RECEIPT clock, not the exchange timestamp", () => {
  const s = new TickStore();
  // Exchange timestamp far in the past, but received 'now' → still fresh.
  s.set(tick(1, 100, 1_000), 10_000);
  assert.equal(s.isFresh(1, 5_000, 12_000), true); // 2s since receipt ≤ 5s
  assert.equal(s.isFresh(1, 5_000, 20_000), false); // 10s since receipt > 5s
  assert.equal(s.isFresh(99, 5_000, 10_000), false); // unknown token never fresh
});

test("lastReceivedMs reports the newest receipt across tokens", () => {
  const s = new TickStore();
  s.set(tick(1, 100), 5_000);
  s.set(tick(2, 200), 8_000);
  assert.equal(s.lastReceivedMs(), 8_000);
  assert.equal(s.lastReceivedMs([1]), 5_000);
  assert.equal(s.lastReceivedMs([42]), null);
});
