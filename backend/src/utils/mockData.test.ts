import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuote, mockAnalysis, mockTradePlan } from "./mockData";

test("buildQuote normalises the symbol and returns a numeric LTP", () => {
  const q = buildQuote("reliance");
  assert.equal(q.symbol, "RELIANCE");
  assert.equal(typeof q.ltp, "number");
});

test("mockTradePlan always includes risk controls (stop-loss, target, R:R)", () => {
  const p = mockTradePlan({ symbol: "RELIANCE", segment: "equity" });
  assert.notEqual(p.stopLoss, null);
  assert.notEqual(p.target, null);
  assert.ok(typeof p.riskReward === "number" && p.riskReward > 0);
  assert.equal(p.demo, true);
  assert.equal(p.source, "mock");
  assert.ok(p.disclaimer.length > 0);
});

test("mockTradePlan is deterministic for the same symbol", () => {
  const a = mockTradePlan({ symbol: "NIFTY" });
  const b = mockTradePlan({ symbol: "NIFTY" });
  assert.deepEqual(a, b);
});

test("mockAnalysis returns a valid signal, demo flag and disclaimer", () => {
  const a = mockAnalysis("INFY", "equity");
  assert.ok(["bullish", "bearish", "neutral"].includes(a.signal));
  assert.equal(a.demo, true);
  assert.ok(a.disclaimer.length > 0);
});
