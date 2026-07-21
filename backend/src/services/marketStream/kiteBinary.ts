// =====================================================================
// Kite Connect streaming — binary tick packet parser (PURE, no I/O).
// ---------------------------------------------------------------------
// The Kite WebSocket (wss://ws.kite.trade) delivers market data as big-endian
// binary frames. This module decodes one frame into typed ticks. It is the
// hand-rolled equivalent of the official ticker's `_parseBinary`, kept here so
// the wire format is unit-testable against known byte layouts (a delegated
// library call cannot be). Reference: https://kite.trade/docs/connect/v3/websocket/
//
// Frame envelope:
//   int16  numberOfPackets
//   repeat: int16 packetLength, <packetLength bytes>
// A frame shorter than 2 bytes (or with 0 packets) is a heartbeat → no ticks.
//
// Packet layouts (all fields int32 BE; prices divided by the segment divisor):
//   LTP        (8)   : token, ltp
//   index quote(28)  : token, ltp, high, low, open, close, change
//   index full (32)  : + exchangeTimestamp
//   quote      (44)  : token, ltp, lastQty, avgPrice, volume, buyQty, sellQty, o,h,l,c
//   full       (184) : + lastTradeTime, oi, oiHigh, oiLow, exchangeTimestamp, depth
// =====================================================================

export type TickMode = "ltp" | "quote" | "full";

export interface Tick {
  token: number;
  ltp: number;
  mode: TickMode;
  isIndex: boolean;
  ohlc: { open: number; high: number; low: number; close: number } | null;
  change: number | null;
  volume: number | null;
  oi: number | null;
  /** Exchange-stamped instant of the packet (epoch ms), or null if not present/zero. */
  exchangeTimestampMs: number | null;
  /** Last trade time (epoch ms) for tradable instruments in full mode. */
  lastTradeTimeMs: number | null;
}

// Kite segment codes are the low byte of the instrument token.
const SEG_INDICES = 9;
const SEG_CDS = 3; // NSE currency
const SEG_BCD = 6; // BSE currency

/** Price divisor for a token's segment (currency segments use finer precision). */
export function segmentDivisor(token: number): number {
  const seg = token & 0xff;
  if (seg === SEG_CDS) return 10_000_000;
  if (seg === SEG_BCD) return 10_000;
  return 100;
}

/** True when the token belongs to the indices segment (no depth/volume packets). */
export function isIndexToken(token: number): boolean {
  return (token & 0xff) === SEG_INDICES;
}

function secToMs(sec: number): number | null {
  return sec > 0 ? sec * 1000 : null;
}

/** Decode one Kite binary frame into ticks. Unknown packet lengths are skipped. */
export function parseTicks(buf: Buffer): Tick[] {
  if (!buf || buf.length < 2) return []; // heartbeat / empty
  const count = buf.readInt16BE(0);
  if (count <= 0) return [];
  const ticks: Tick[] = [];
  let offset = 2;
  for (let p = 0; p < count; p++) {
    if (offset + 2 > buf.length) break;
    const len = buf.readInt16BE(offset);
    offset += 2;
    if (len <= 0 || offset + len > buf.length) break;
    const pkt = buf.subarray(offset, offset + len);
    offset += len;
    const tick = parsePacket(pkt);
    if (tick) ticks.push(tick);
  }
  return ticks;
}

function parsePacket(pkt: Buffer): Tick | null {
  if (pkt.length < 8) return null;
  const token = pkt.readInt32BE(0);
  const div = segmentDivisor(token);
  const idx = isIndexToken(token);
  const base: Tick = {
    token,
    ltp: pkt.readInt32BE(4) / div,
    mode: "ltp",
    isIndex: idx,
    ohlc: null,
    change: null,
    volume: null,
    oi: null,
    exchangeTimestampMs: null,
    lastTradeTimeMs: null,
  };

  if (pkt.length === 8) return base; // LTP mode (index or tradable)

  if (idx) {
    // Index quote (28) / full (32).
    if (pkt.length >= 28) {
      base.mode = pkt.length >= 32 ? "full" : "quote";
      base.ohlc = {
        high: pkt.readInt32BE(8) / div,
        low: pkt.readInt32BE(12) / div,
        open: pkt.readInt32BE(16) / div,
        close: pkt.readInt32BE(20) / div,
      };
      base.change = pkt.readInt32BE(24) / div;
      if (pkt.length >= 32) base.exchangeTimestampMs = secToMs(pkt.readInt32BE(28));
    }
    return base;
  }

  // Tradable quote (44) / full (184).
  if (pkt.length >= 44) {
    base.mode = pkt.length >= 184 ? "full" : "quote";
    base.volume = pkt.readInt32BE(16);
    base.ohlc = {
      open: pkt.readInt32BE(28) / div,
      high: pkt.readInt32BE(32) / div,
      low: pkt.readInt32BE(36) / div,
      close: pkt.readInt32BE(40) / div,
    };
    if (pkt.length >= 184) {
      base.lastTradeTimeMs = secToMs(pkt.readInt32BE(44));
      base.oi = pkt.readInt32BE(48);
      base.exchangeTimestampMs = secToMs(pkt.readInt32BE(60));
    }
  }
  return base;
}

// ---------------------------------------------------------------------
// Subscription control messages (client → server), JSON per the Kite spec.
// ---------------------------------------------------------------------
export function subscribeMessage(tokens: number[]): string {
  return JSON.stringify({ a: "subscribe", v: tokens });
}
export function unsubscribeMessage(tokens: number[]): string {
  return JSON.stringify({ a: "unsubscribe", v: tokens });
}
export function modeMessage(mode: TickMode, tokens: number[]): string {
  return JSON.stringify({ a: "mode", v: [mode, tokens] });
}
