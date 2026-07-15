import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveIdentity } from "./instrumentIdentity";
import { scoreRelevance, affectsDecision, hasPhrase } from "./newsRelevance";

const RELIANCE = resolveIdentity({ exchange: "NSE", tradingsymbol: "RELIANCE", instrumentType: "EQ", name: "Reliance Industries" });
const BANKNIFTY = resolveIdentity({ exchange: "NFO", tradingsymbol: "BANKNIFTY26JULFUT", instrumentType: "FUT", name: "BANKNIFTY" });
const MIDCP = resolveIdentity({ exchange: "NFO", tradingsymbol: "MIDCPNIFTY26JULFUT", instrumentType: "FUT", name: "MIDCPNIFTY" });

test("whole-word matching, not crude substring", () => {
  assert.equal(hasPhrase(" reliance jio launches plan ", "jio"), true);
  assert.equal(hasPhrase(" preliance is not reliance ", "reliance"), true); // still matches the standalone word
  assert.equal(hasPhrase(" carbonril product ", "ril"), false); // no false substring hit inside a word
});

test("RELIANCE: direct company news is DIRECT_INSTRUMENT and affects the decision", () => {
  const r = scoreRelevance("Reliance Industries Q1 profit jumps 12%", RELIANCE);
  assert.equal(r.type, "DIRECT_INSTRUMENT");
  assert.equal(affectsDecision(r.score), true);
});

test("RELIANCE: unrelated company earnings is IRRELEVANT and does NOT affect the decision", () => {
  const r = scoreRelevance("Infosys posts record quarterly profit", RELIANCE);
  assert.equal(r.type, "IRRELEVANT");
  assert.equal(r.score, 0);
  assert.equal(affectsDecision(r.score), false);
});

test("RELIANCE: crude/oil is SECTOR; RBI is MACRO context; Nifty is BENCHMARK", () => {
  assert.equal(scoreRelevance("Crude oil prices surge on supply cut", RELIANCE).type, "SECTOR");
  assert.equal(scoreRelevance("RBI keeps repo rate unchanged", RELIANCE).type, "MACRO");
  assert.equal(scoreRelevance("Nifty ends higher led by IT stocks", RELIANCE).type, "BENCHMARK");
  // MACRO/BENCHMARK are context-only (below the decision gate).
  assert.equal(affectsDecision(scoreRelevance("RBI keeps repo rate unchanged", RELIANCE).score), false);
});

test("BANKNIFTY: RBI/repo-rate is SECTOR and affects the decision", () => {
  const r = scoreRelevance("RBI cuts repo rate by 25 bps", BANKNIFTY);
  assert.equal(r.type, "SECTOR");
  assert.equal(affectsDecision(r.score), true);
});

test("MIDCPNIFTY: midcap news is decision-relevant; single-stock news is not direct", () => {
  assert.equal(affectsDecision(scoreRelevance("Midcap stocks rally as broader market gains", MIDCP).score), true);
  assert.notEqual(scoreRelevance("Reliance Industries announces buyback", MIDCP).type, "DIRECT_INSTRUMENT");
});
