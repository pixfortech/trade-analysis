import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChainMetrics, type OptionRow } from "./optionsChain.service";

function side(oi: number | null) {
  return { ltp: 10, change: 1, changePercent: 1, volume: 100, oi, bid: 9, ask: 11, instrument: "NFO:X", token: 1 };
}
function row(strike: number, ceOi: number | null, peOi: number | null): OptionRow {
  return { strike, isATM: false, ce: side(ceOi), pe: side(peOi) };
}

test("computeChainMetrics: PCR, support, resistance, ATM, max-pain from real OI", () => {
  // Spot 100. CE OI heaviest at 105 (resistance), PE OI heaviest at 95 (support).
  const rows = [row(90, 100, 900), row(95, 200, 1500), row(100, 400, 800), row(105, 1200, 300), row(110, 900, 100)];
  const m = computeChainMetrics(rows, 100);
  assert.equal(m.atm, 100);
  assert.equal(m.resistance, 105); // highest CE OI
  assert.equal(m.support, 95); // highest PE OI
  const totalCe = 100 + 200 + 400 + 1200 + 900;
  const totalPe = 900 + 1500 + 800 + 300 + 100;
  assert.equal(m.pcr, Math.round((totalPe / totalCe) * 100) / 100);
  assert.ok(m.maxPain != null && rows.some((r) => r.strike === m.maxPain));
  assert.ok(m.completeness === 1);
});

test("computeChainMetrics: no OI → PCR/max-pain/S-R are null (never fabricated)", () => {
  const rows = [row(90, null, null), row(100, null, null), row(110, null, null)];
  const m = computeChainMetrics(rows, 100);
  assert.equal(m.pcr, null);
  assert.equal(m.maxPain, null);
  assert.equal(m.support, null);
  assert.equal(m.resistance, null);
  assert.equal(m.atm, 100); // ATM only needs spot + strikes
});
