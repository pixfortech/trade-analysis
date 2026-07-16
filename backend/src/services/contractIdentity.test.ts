import { test } from "node:test";
import assert from "node:assert/strict";
import { contractIdentity, extractQuote, fmtExpiry } from "./contractIdentity";
import type { Instrument } from "./instruments.service";

function inst(over: Partial<Instrument>): Instrument {
  return { instrumentToken: 1, exchangeToken: 1, tradingsymbol: "X", name: "X", lastPrice: 0, expiry: "", strike: 0, tickSize: 0.05, lotSize: 1, instrumentType: "EQ", segment: "NSE", exchange: "NSE", ...over };
}

test("option label keeps underlying + expiry + strike + CE/PE (never just NIFTY)", () => {
  const ce = contractIdentity(inst({ exchange: "NFO", tradingsymbol: "NIFTY26JUL25000CE", name: "NIFTY", instrumentType: "CE", strike: 25000, expiry: "2026-07-24", lotSize: 75 }));
  assert.equal(ce.displayName, "NIFTY 24 Jul 2026 · 25,000 CE");
  assert.equal(ce.compactName, "NIFTY 25,000 CE · 24 Jul");
  assert.equal(ce.optionType, "CE");
  assert.equal(ce.underlying, "NIFTY");
  assert.equal(ce.strike, 25000);
  assert.equal(ce.lotSize, 75);
  const pe = contractIdentity(inst({ exchange: "NFO", tradingsymbol: "MIDCPNIFTY26JUL14800PE", name: "MIDCPNIFTY", instrumentType: "PE", strike: 14800, expiry: "2026-07-27" }));
  assert.equal(pe.displayName, "MIDCPNIFTY 27 Jul 2026 · 14,800 PE");
  assert.equal(pe.optionType, "PE");
});

test("future + equity labels", () => {
  const fut = contractIdentity(inst({ exchange: "NFO", tradingsymbol: "RELIANCE26JULFUT", name: "RELIANCE", instrumentType: "FUT", expiry: "2026-07-30" }));
  assert.equal(fut.displayName, "RELIANCE 30 Jul 2026 FUT");
  assert.equal(fut.optionType, "");
  const eq = contractIdentity(inst({ exchange: "NSE", tradingsymbol: "RELIANCE", name: "Reliance Industries", instrumentType: "EQ" }));
  assert.equal(eq.displayName, "Reliance Industries");
});

test("fmtExpiry formats or returns null", () => {
  assert.deepEqual(fmtExpiry("2026-07-24"), { long: "24 Jul 2026", short: "24 Jul" });
  assert.equal(fmtExpiry("garbage"), null);
});

test("extractQuote derives change/pct/oi/bid/ask/spread", () => {
  const q = { last_price: 110, ohlc: { close: 100 }, volume: 5000, oi: 120000, depth: { buy: [{ price: 109.5 }], sell: [{ price: 110.5 }] }, last_trade_time: "2026-07-24 14:02:15" };
  const r = extractQuote(q, "Asia/Kolkata");
  assert.equal(r.ltp, 110);
  assert.equal(r.change, 10);
  assert.equal(r.changePercent, 10);
  assert.equal(r.oi, 120000);
  assert.equal(r.bid, 109.5);
  assert.equal(r.ask, 110.5);
  assert.ok(r.spreadPct != null && r.spreadPct > 0);
  assert.ok(r.exchangeTimeMs != null);
  // near-zero prev close → change/pct guarded to 0 (no explosion)
  assert.equal(extractQuote({ last_price: 40, ohlc: { close: 0 } }, "Asia/Kolkata").changePercent, 0);
});
