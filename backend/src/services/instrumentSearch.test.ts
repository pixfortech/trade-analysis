import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, displayName, groupedSearch, parseQuery, toResult } from "./instrumentSearch";
import { parseInstrumentsCsv, type Instrument } from "./instruments.service";

const CSV = [
  "instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange",
  "738561,2885,RELIANCE,RELIANCE,0,,0,0.05,1,EQ,NSE,NSE",
  "256265,1001,NIFTY 50,NIFTY 50,0,,0,0,0,EQ,INDICES,INDICES",
  "260105,1100,NIFTY BANK,NIFTY BANK,0,,0,0,0,EQ,INDICES,INDICES",
  "11823618,46186,MIDCPNIFTY26JUNFUT,MIDCPNIFTY,0,2026-06-25,0,0.05,75,FUT,NFO-FUT,NFO",
  "11823619,46187,MIDCPNIFTY26JULFUT,MIDCPNIFTY,0,2026-07-30,0,0.05,75,FUT,NFO-FUT,NFO",
  "1111,1,RELIANCE26JUNFUT,RELIANCE,0,2026-06-25,0,0.05,250,FUT,NFO-FUT,NFO",
  "2221,2,NIFTY26JUN24500CE,NIFTY,0,2026-06-25,24500,0.05,50,CE,NFO-OPT,NFO",
  "2222,3,NIFTY26JUN24500PE,NIFTY,0,2026-06-25,24500,0.05,50,PE,NFO-OPT,NFO",
  "2223,4,NIFTY26JUN24600CE,NIFTY,0,2026-06-25,24600,0.05,50,CE,NFO-OPT,NFO",
].join("\n");

const LIST: Instrument[] = parseInstrumentsCsv(CSV);

test("classify: equity, index, future, option", () => {
  const by = (sym: string) => LIST.find((i) => i.tradingsymbol === sym)!;
  assert.equal(classify(by("RELIANCE")).uiSegment, "equity");
  assert.equal(classify(by("NIFTY 50")).uiSegment, "indices");
  assert.equal(classify(by("MIDCPNIFTY26JUNFUT")).uiType, "FUT");
  assert.equal(classify(by("NIFTY26JUN24500CE")).uiType, "CE");
});

test("displayName shows expiry / strike / CE-PE clearly", () => {
  const fut = LIST.find((i) => i.tradingsymbol === "MIDCPNIFTY26JUNFUT")!;
  assert.match(toResult(fut).displayName, /MIDCPNIFTY FUT/);
  const ce = LIST.find((i) => i.tradingsymbol === "NIFTY26JUN24500CE")!;
  assert.match(displayName(ce, "CE"), /24500 CE/);
});

test("parseQuery extracts strike + CE/PE + FUT hints", () => {
  assert.deepEqual(parseQuery("NIFTY 24500 CE"), {
    text: "NIFTY",
    strike: 24500,
    optionType: "CE",
    wantsFutures: false,
    wantsOptions: true,
  });
  const f = parseQuery("MIDCPNIFTY FUT");
  assert.equal(f.text, "MIDCPNIFTY");
  assert.equal(f.wantsFutures, true);
});

test("search RELIANCE groups equity first and includes its future", () => {
  const g = groupedSearch(LIST, { q: "RELIANCE" });
  assert.ok(g.equity.length === 1 && g.equity[0].tradingsymbol === "RELIANCE");
  assert.ok(g.futures.some((r) => r.tradingsymbol === "RELIANCE26JUNFUT"));
});

test("search MIDCPNIFTY returns futures (nearest expiry first)", () => {
  const g = groupedSearch(LIST, { q: "MIDCPNIFTY" });
  assert.equal(g.futures[0].tradingsymbol, "MIDCPNIFTY26JUNFUT");
  assert.equal(g.futures.length, 2);
});

test('search "NIFTY 24500 CE" returns the matching option only', () => {
  const g = groupedSearch(LIST, { q: "NIFTY 24500 CE" });
  assert.ok(g.options.length >= 1);
  assert.ok(g.options.every((o) => o.optionType === "CE" && o.strike === 24500));
  // a PE at the same strike must not appear
  assert.ok(!g.options.some((o) => o.optionType === "PE"));
});

test("search indices: NIFTY surfaces index entries", () => {
  const g = groupedSearch(LIST, { q: "NIFTY", segment: "indices" });
  assert.ok(g.indices.some((i) => i.tradingsymbol === "NIFTY 50"));
  assert.equal(g.equity.length, 0);
  assert.equal(g.futures.length, 0);
});

test("segment filter limits results to one group", () => {
  const g = groupedSearch(LIST, { q: "MIDCPNIFTY", segment: "futures" });
  assert.ok(g.futures.length === 2);
  assert.equal(g.equity.length, 0);
  assert.equal(g.options.length, 0);
});

test("no match → all groups empty", () => {
  const g = groupedSearch(LIST, { q: "ZZZNONEXISTENT" });
  assert.equal(g.equity.length + g.indices.length + g.futures.length + g.options.length, 0);
});

test("limitPerGroup caps each group", () => {
  const g = groupedSearch(LIST, { q: "NIFTY", segment: "options", limitPerGroup: 1 });
  assert.ok(g.options.length <= 1);
});
