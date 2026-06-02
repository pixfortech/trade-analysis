import { test } from "node:test";
import assert from "node:assert/strict";
import { realised, unrealised, summary, toView, type PaperTrade } from "./paperTrades";

// These tests cover the PURE P/L math (no file I/O, no store mutation).

test("LONG unrealised P/L = (current - entry) * qty", () => {
  assert.equal(unrealised("LONG", 100, 110, 50), 500);
  assert.equal(unrealised("LONG", 100, 90, 50), -500);
});

test("SHORT unrealised P/L = (entry - current) * qty", () => {
  assert.equal(unrealised("SHORT", 100, 90, 50), 500);
  assert.equal(unrealised("SHORT", 100, 110, 50), -500);
});

test("LONG and SHORT P/L are OPPOSITE for the same move", () => {
  const move = { entry: 200, current: 215, qty: 75 };
  const long = unrealised("LONG", move.entry, move.current, move.qty);
  const short = unrealised("SHORT", move.entry, move.current, move.qty);
  assert.equal(long, -short);
  assert.notEqual(long, short); // not a shared placeholder
});

test("realised P/L: long uses exit-entry, short uses entry-exit", () => {
  assert.equal(realised("LONG", 100, 120, 10), 200);
  assert.equal(realised("SHORT", 100, 80, 10), 200);
  assert.equal(realised("SHORT", 100, 120, 10), -200);
});

test("toView attaches live MTM and pnl% for a long", () => {
  const t: PaperTrade = {
    id: "1",
    instrumentKey: "NSE:RELIANCE",
    displayName: "RELIANCE",
    direction: "LONG",
    entryPrice: 100,
    quantity: 50,
    initialQuantity: 50,
    lotSize: 1,
    lots: 50,
    stopLoss: 95,
    targets: [105, 110, 115],
    status: "OPEN",
    entryTime: "t",
    exitPrice: null,
    exitTime: null,
    realisedPnl: 0,
    notes: "",
    source: "paper-simulation",
  };
  const v = toView(t, new Map([["NSE:RELIANCE", 110]]));
  assert.equal(v.currentPrice, 110);
  assert.equal(v.unrealisedPnl, 500);
  assert.equal(v.pnlPercent, 10); // 500 / (100*50) * 100
});

test("toView with no live price → unrealised 0", () => {
  const t = {
    id: "2", instrumentKey: "NSE:X", displayName: "X", direction: "SHORT", entryPrice: 50, quantity: 10,
    initialQuantity: 10, lotSize: 1, lots: 10, stopLoss: null, targets: [], status: "OPEN",
    entryTime: "t", exitPrice: null, exitTime: null, realisedPnl: 0, notes: "", source: "paper-simulation",
  } as PaperTrade;
  const v = toView(t, new Map());
  assert.equal(v.currentPrice, null);
  assert.equal(v.unrealisedPnl, 0);
});

test("summary totals unrealised + realised", () => {
  const views = [
    toView(
      { id: "a", instrumentKey: "NSE:A", displayName: "A", direction: "LONG", entryPrice: 100, quantity: 10, initialQuantity: 10, lotSize: 1, lots: 10, stopLoss: null, targets: [], status: "OPEN", entryTime: "t", exitPrice: null, exitTime: null, realisedPnl: 0, notes: "", source: "paper-simulation" },
      new Map([["NSE:A", 110]]),
    ),
    toView(
      { id: "b", instrumentKey: "NSE:B", displayName: "B", direction: "SHORT", entryPrice: 100, quantity: 0, initialQuantity: 10, lotSize: 1, lots: 10, stopLoss: null, targets: [], status: "CLOSED", entryTime: "t", exitPrice: 90, exitTime: "t2", realisedPnl: 100, notes: "", source: "paper-simulation" },
      new Map(),
    ),
  ];
  const s = summary(views);
  assert.equal(s.totalUnrealisedPnl, 100);
  assert.equal(s.totalRealisedPnl, 100);
  assert.equal(s.totalPnl, 200);
  assert.equal(s.openCount, 1);
});
