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

// ---------------------------------------------------------------------------
// Deterministic expiry-boundary fixture. Expiry ranking is time-injected via
// `opts.now`, so these are stable regardless of the machine/system date. Three
// expiries per family (an expired May, a June, a following July) around fixed
// as-of dates prove the rollover logic instead of freezing an old expectation.
// ---------------------------------------------------------------------------
const EXP_MAY = "2026-05-28"; // expired relative to the June/July as-of dates
const EXP_JUN = "2026-06-25";
const EXP_JUL = "2026-07-30";

function futRow(token: number, under: string, mon: string, expiry: string, lot: number): string {
  return `${token},${token},${under}26${mon}FUT,${under},0,${expiry},0,0.05,${lot},FUT,NFO-FUT,NFO`;
}
const EXPIRY_LIST: Instrument[] = parseInstrumentsCsv(
  [
    "instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange",
    ...[
      { u: "MIDCPNIFTY", lot: 75 },
      { u: "NIFTY", lot: 50 },
      { u: "BANKNIFTY", lot: 15 },
      { u: "RELIANCE", lot: 250 },
    ].flatMap(({ u, lot }, i) => [
      futRow(9000 + i * 3 + 0, u, "MAY", EXP_MAY, lot),
      futRow(9000 + i * 3 + 1, u, "JUN", EXP_JUN, lot),
      futRow(9000 + i * 3 + 2, u, "JUL", EXP_JUL, lot),
    ]),
  ].join("\n"),
);

// As-of instants (epoch ms). Chosen so their Asia/Kolkata market date is clear.
const ASOF_BEFORE_JUN = Date.UTC(2026, 5, 10, 5, 0, 0); // 2026-06-10 10:30 IST — before June expiry
const ASOF_ON_JUN = Date.UTC(2026, 5, 25, 5, 0, 0); // 2026-06-25 10:30 IST — June expiry day, market hours
const ASOF_AFTER_JUN = Date.UTC(2026, 5, 26, 5, 0, 0); // 2026-06-26 10:30 IST — day after June expiry
const ASOF_TZ_BOUNDARY = Date.UTC(2026, 5, 25, 20, 0, 0); // 2026-06-25 20:00 UTC = 2026-06-26 01:30 IST

/** Nearest (first-ranked) future tradingsymbol for an underlying at a fixed as-of. */
function nearestFut(under: string, now: number): string | undefined {
  const g = groupedSearch(EXPIRY_LIST, { q: under, segment: "futures" }, { now });
  return g.futures.filter((f) => f.name === under)[0]?.tradingsymbol; // isolate the family (NIFTY ⊂ BANKNIFTY/MIDCPNIFTY text)
}

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

test("search MIDCPNIFTY returns futures (nearest non-expired expiry first)", () => {
  // As-of a fixed date BEFORE the June expiry → June is the nearest valid contract.
  const g = groupedSearch(LIST, { q: "MIDCPNIFTY" }, { now: ASOF_BEFORE_JUN });
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

// ---------------------------------------------------------------------------
// Expiry-boundary coverage — deterministic via injected as-of dates (§5 A–G).
// ---------------------------------------------------------------------------

test("expiry A: before expiry, the nearest current (June) contract is selected", () => {
  assert.equal(nearestFut("MIDCPNIFTY", ASOF_BEFORE_JUN), "MIDCPNIFTY26JUNFUT");
});

test("expiry B: on the expiry date (market hours) the contract is still valid — last trading day", () => {
  assert.equal(nearestFut("MIDCPNIFTY", ASOF_ON_JUN), "MIDCPNIFTY26JUNFUT");
});

test("expiry C: the market day after expiry rolls over to the next (July) contract", () => {
  assert.equal(nearestFut("MIDCPNIFTY", ASOF_AFTER_JUN), "MIDCPNIFTY26JULFUT");
});

test("expiry D: an expired contract is NEVER selected as the nearest", () => {
  for (const now of [ASOF_BEFORE_JUN, ASOF_ON_JUN, ASOF_AFTER_JUN, ASOF_TZ_BOUNDARY]) {
    assert.notEqual(nearestFut("MIDCPNIFTY", now), "MIDCPNIFTY26MAYFUT");
  }
});

test("expiry E: with multiple expiries the earliest valid non-expired is first; expired ranks last", () => {
  const g = groupedSearch(EXPIRY_LIST, { q: "MIDCPNIFTY", segment: "futures" }, { now: ASOF_BEFORE_JUN });
  const order = g.futures.filter((f) => f.name === "MIDCPNIFTY").map((f) => f.tradingsymbol);
  assert.deepEqual(order, ["MIDCPNIFTY26JUNFUT", "MIDCPNIFTY26JULFUT", "MIDCPNIFTY26MAYFUT"]);
});

test("expiry F: MIDCPNIFTY rolls June → July across its expiry", () => {
  assert.equal(nearestFut("MIDCPNIFTY", ASOF_BEFORE_JUN), "MIDCPNIFTY26JUNFUT");
  assert.equal(nearestFut("MIDCPNIFTY", ASOF_AFTER_JUN), "MIDCPNIFTY26JULFUT");
});

test("expiry G: the same resolver rolls over for NIFTY, BANKNIFTY and stock (RELIANCE) futures", () => {
  for (const under of ["NIFTY", "BANKNIFTY", "RELIANCE"]) {
    assert.equal(nearestFut(under, ASOF_BEFORE_JUN), `${under}26JUNFUT`, `${under}: before expiry → June`);
    assert.equal(nearestFut(under, ASOF_AFTER_JUN), `${under}26JULFUT`, `${under}: after expiry → July`);
  }
});

test("expiry TZ: expiry uses the Asia/Kolkata market date, not UTC midnight", () => {
  // 2026-06-25 20:00 UTC is already 2026-06-26 in IST → June is expired, July is
  // nearest. A naive UTC-date compare would wrongly keep June selected.
  assert.equal(nearestFut("MIDCPNIFTY", ASOF_TZ_BOUNDARY), "MIDCPNIFTY26JULFUT");
});
