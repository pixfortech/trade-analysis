import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInstrumentsCsv,
  resolveInstrument,
  searchInstruments,
  splitCsvLine,
  type Instrument,
} from "./instruments.service";

// A small synthetic instruments dump mirroring Kite's CSV columns.
const CSV = [
  "instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange",
  "738561,2885,RELIANCE,RELIANCE,0,,0,0.05,1,EQ,NSE,NSE",
  "11823618,46186,MIDCPNIFTY26JUNFUT,MIDCPNIFTY,0,2026-06-25,0,0.05,75,FUT,NFO-FUT,NFO",
  "11823619,46187,MIDCPNIFTY26JULFUT,MIDCPNIFTY,0,2026-07-30,0,0.05,75,FUT,NFO-FUT,NFO",
  "256265,1001,NIFTY26JUN24500CE,NIFTY,0,2026-06-25,24500,0.05,50,CE,NFO-OPT,NFO",
  "256266,1002,NIFTY26JUN24500PE,NIFTY,0,2026-06-25,24500,0.05,50,PE,NFO-OPT,NFO",
  "256267,1003,NIFTY26JUN24600CE,NIFTY,0,2026-06-25,24600,0.05,50,CE,NFO-OPT,NFO",
  "260105,1100,BANKNIFTY26JUNFUT,BANKNIFTY,0,2026-06-25,0,0.05,15,FUT,NFO-FUT,NFO",
].join("\n");

const LIST: Instrument[] = parseInstrumentsCsv(CSV);

test("splitCsvLine handles quoted fields", () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ["a", "b,c", "d"]);
});

test("parses the expected number of instruments with correct fields", () => {
  assert.equal(LIST.length, 7);
  const fut = LIST.find((i) => i.tradingsymbol === "MIDCPNIFTY26JUNFUT")!;
  assert.equal(fut.exchange, "NFO");
  assert.equal(fut.instrumentType, "FUT");
  assert.equal(fut.lotSize, 75);
  assert.equal(fut.instrumentToken, 11823618);
  assert.equal(fut.expiry, "2026-06-25");
});

test("search by q + segment + instrumentType (MIDCPNIFTY futures)", () => {
  const res = searchInstruments(LIST, { q: "MIDCPNIFTY", segment: "NFO", instrumentType: "FUT" });
  assert.equal(res.length, 2);
  assert.ok(res.every((i) => i.name === "MIDCPNIFTY" && i.instrumentType === "FUT"));
  // sorted by nearest expiry first
  assert.equal(res[0].tradingsymbol, "MIDCPNIFTY26JUNFUT");
});

test("resolve futures: underlying + nearest expiry → exact symbol", () => {
  const r = resolveInstrument(LIST, { underlying: "MIDCPNIFTY", instrumentType: "FUT" });
  assert.ok(r.resolved, r.message);
  assert.equal(r.resolved!.tradingsymbol, "MIDCPNIFTY26JUNFUT");
  assert.equal(r.resolved!.exchange, "NFO");
  assert.equal(r.resolved!.instrumentToken, 11823618);
});

test("resolve futures with explicit expiry month prefix (YYYY-MM)", () => {
  const r = resolveInstrument(LIST, { underlying: "MIDCPNIFTY", instrumentType: "FUT", expiry: "2026-07" });
  assert.ok(r.resolved, r.message);
  assert.equal(r.resolved!.tradingsymbol, "MIDCPNIFTY26JULFUT");
});

test("resolve options: underlying + expiry + strike + CE → exact", () => {
  const r = resolveInstrument(LIST, {
    underlying: "NIFTY",
    instrumentType: "CE",
    expiry: "2026-06-25",
    strike: 24500,
  });
  assert.ok(r.resolved, r.message);
  assert.equal(r.resolved!.tradingsymbol, "NIFTY26JUN24500CE");
  assert.equal(r.resolved!.strike, 24500);
});

test("resolve options via optionType alias", () => {
  const r = resolveInstrument(LIST, {
    underlying: "NIFTY",
    instrumentType: "",
    optionType: "PE",
    expiry: "2026-06-25",
    strike: 24500,
  });
  assert.ok(r.resolved, r.message);
  assert.equal(r.resolved!.tradingsymbol, "NIFTY26JUN24500PE");
});

test("options without strike → candidates + guidance, not a guess", () => {
  const r = resolveInstrument(LIST, { underlying: "NIFTY", instrumentType: "CE", expiry: "2026-06-25" });
  assert.equal(r.resolved, null);
  assert.ok(r.candidates.length >= 2);
  assert.match(r.message, /strike/i);
});

test("missing strike match → nearest strikes suggested", () => {
  const r = resolveInstrument(LIST, {
    underlying: "NIFTY",
    instrumentType: "CE",
    expiry: "2026-06-25",
    strike: 24550,
  });
  assert.equal(r.resolved, null);
  assert.ok(r.candidates.length >= 1);
  assert.match(r.message, /strike/i);
});

test("unknown underlying → helpful no-match message", () => {
  const r = resolveInstrument(LIST, { underlying: "NOSUCH", instrumentType: "FUT" });
  assert.equal(r.resolved, null);
  assert.match(r.message, /No FUT contracts/i);
});

test("equity resolution for RELIANCE", () => {
  const r = resolveInstrument(LIST, { underlying: "RELIANCE", instrumentType: "EQ" });
  assert.ok(r.resolved, r.message);
  assert.equal(r.resolved!.exchange, "NSE");
  assert.equal(r.resolved!.tradingsymbol, "RELIANCE");
});

test("bad header → empty parse (no throw)", () => {
  assert.deepEqual(parseInstrumentsCsv("foo,bar\n1,2"), []);
});
