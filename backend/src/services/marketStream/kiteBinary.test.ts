import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTicks, segmentDivisor, isIndexToken, subscribeMessage, unsubscribeMessage, modeMessage } from "./kiteBinary";

// Tokens chosen so the low byte encodes the segment we want:
const INDEX_TOKEN = 256265; // 256265 & 0xff === 9 → INDICES (NIFTY 50)
const EQUITY_TOKEN = 738561; // 738561 & 0xff === 1 → NSE tradable (RELIANCE)

function i32(...vals: number[]): Buffer {
  const b = Buffer.alloc(vals.length * 4);
  vals.forEach((v, idx) => b.writeInt32BE(v, idx * 4));
  return b;
}
/** Wrap packets into a Kite frame envelope. */
function frame(...packets: Buffer[]): Buffer {
  const head = Buffer.alloc(2);
  head.writeInt16BE(packets.length, 0);
  const parts: Buffer[] = [head];
  for (const p of packets) {
    const len = Buffer.alloc(2);
    len.writeInt16BE(p.length, 0);
    parts.push(len, p);
  }
  return Buffer.concat(parts);
}

test("segment divisor and index detection", () => {
  assert.equal(segmentDivisor(EQUITY_TOKEN), 100);
  assert.equal(segmentDivisor(256 + 3), 10_000_000); // CDS
  assert.equal(segmentDivisor(256 + 6), 10_000); // BCD
  assert.equal(isIndexToken(INDEX_TOKEN), true);
  assert.equal(isIndexToken(EQUITY_TOKEN), false);
});

test("heartbeat / empty frames yield no ticks", () => {
  assert.deepEqual(parseTicks(Buffer.alloc(0)), []);
  assert.deepEqual(parseTicks(Buffer.from([0])), []);
  assert.deepEqual(parseTicks(frame()), []); // 0 packets
});

test("LTP packet (8 bytes) decodes token + price with /100 divisor", () => {
  const ticks = parseTicks(frame(i32(EQUITY_TOKEN, 2890_50)));
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].token, EQUITY_TOKEN);
  assert.equal(ticks[0].ltp, 2890.5);
  assert.equal(ticks[0].mode, "ltp");
  assert.equal(ticks[0].isIndex, false);
});

test("index quote packet (28 bytes) decodes OHLC + change, no exchange ts", () => {
  const pkt = i32(INDEX_TOKEN, 2204530, 2210000, 2198000, 2200000, 2191300, 13245);
  const t = parseTicks(frame(pkt))[0];
  assert.equal(t.token, INDEX_TOKEN);
  assert.equal(t.ltp, 22045.3);
  assert.equal(t.mode, "quote");
  assert.equal(t.isIndex, true);
  assert.deepEqual(t.ohlc, { high: 22100, low: 21980, open: 22000, close: 21913 });
  assert.equal(t.change, 132.45);
  assert.equal(t.exchangeTimestampMs, null);
});

test("index full packet (32 bytes) carries the exchange timestamp (seconds→ms)", () => {
  const secs = 1_700_000_000;
  const pkt = Buffer.concat([i32(INDEX_TOKEN, 2204530, 2210000, 2198000, 2200000, 2191300, 13245), i32(secs)]);
  const t = parseTicks(frame(pkt))[0];
  assert.equal(t.mode, "full");
  assert.equal(t.exchangeTimestampMs, secs * 1000);
});

test("tradable quote packet (44 bytes) decodes volume + OHLC", () => {
  // token, ltp, lastQty, avgPrice, volume, buyQty, sellQty, open, high, low, close
  const pkt = i32(EQUITY_TOKEN, 2890_50, 10, 2889_00, 1_250_000, 500, 600, 2880_00, 2895_00, 2875_00, 2870_00);
  assert.equal(pkt.length, 44);
  const t = parseTicks(frame(pkt))[0];
  assert.equal(t.ltp, 2890.5);
  assert.equal(t.mode, "quote");
  assert.equal(t.volume, 1_250_000);
  assert.deepEqual(t.ohlc, { open: 2880, high: 2895, low: 2875, close: 2870 });
  assert.equal(t.oi, null);
});

test("tradable full packet (184 bytes) carries OI + last-trade + exchange ts", () => {
  const quote = i32(EQUITY_TOKEN, 2890_50, 10, 2889_00, 1_250_000, 500, 600, 2880_00, 2895_00, 2875_00, 2870_00);
  const ltt = 1_700_000_100;
  const exTs = 1_700_000_123;
  const extra = i32(ltt, 987_654, 990_000, 980_000, exTs); // ltt, oi, oiHigh, oiLow, exchangeTs
  const depth = Buffer.alloc(120); // 10 depth entries × 12 bytes
  const pkt = Buffer.concat([quote, extra, depth]);
  assert.equal(pkt.length, 184);
  const t = parseTicks(frame(pkt))[0];
  assert.equal(t.mode, "full");
  assert.equal(t.oi, 987_654);
  assert.equal(t.lastTradeTimeMs, ltt * 1000);
  assert.equal(t.exchangeTimestampMs, exTs * 1000);
});

test("multiple packets in one frame all decode", () => {
  const ltp = i32(EQUITY_TOKEN, 2890_50);
  const idx = i32(INDEX_TOKEN, 2204530, 2210000, 2198000, 2200000, 2191300, 13245);
  const ticks = parseTicks(frame(ltp, idx));
  assert.equal(ticks.length, 2);
  assert.equal(ticks[0].token, EQUITY_TOKEN);
  assert.equal(ticks[1].token, INDEX_TOKEN);
});

test("truncated frame stops cleanly without throwing", () => {
  const good = frame(i32(EQUITY_TOKEN, 2890_50));
  const truncated = good.subarray(0, good.length - 3); // chop the last packet
  assert.doesNotThrow(() => parseTicks(truncated));
});

test("subscribe / unsubscribe / mode control messages match the Kite JSON spec", () => {
  assert.equal(subscribeMessage([1, 2]), '{"a":"subscribe","v":[1,2]}');
  assert.equal(unsubscribeMessage([3]), '{"a":"unsubscribe","v":[3]}');
  assert.equal(modeMessage("full", [1]), '{"a":"mode","v":["full",[1]]}');
});
