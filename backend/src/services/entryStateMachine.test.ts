import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateEntry,
  evaluateExit,
  proximityDistance,
  remainingRR,
  DEFAULT_ENTRY_GATES,
  type LockedLevels,
  type EvidenceSnapshot,
  type EntryGates,
  type PositionInput,
} from "./entryStateMachine";

// Acceptance fixture (§19): analyse 14830.90; preferred entry 14900.25–14905.60.
const LV_LONG: LockedLevels = { entry: 14900.25, safeLow: 14900.25, safeHigh: 14905.6, stop: 14864.5, target1: 14948.4, invalidation: 14842.0, atr: 20 };
const EV_OK: EvidenceSnapshot = { winEstimate: 81, setupStrength: 70, reversalSignals: 0, dataStale: false, evidenceStale: false };
// Gates matching the acceptance narrative (a late entry at 14910 stays valid; the
// ATR-extension gate rejects 14930). lateEntryMinRR is deliberately permissive here.
const GATES: EntryGates = { ...DEFAULT_ENTRY_GATES, lateEntryMinRR: 0.5 };

// -------------------------------------------------------------------- LONG §19
test("LONG 14850 → WAIT · 50.25 pts to entry", () => {
  const r = evaluateEntry("LONG", 14850, LV_LONG, EV_OK, GATES);
  assert.equal(r.state, "WAIT");
  assert.equal(r.distanceToEntry, 50.25);
  assert.equal(r.approved, false);
});

test("LONG 14890 → PREPARE · 10.25 pts to entry (setup valid, within proximity)", () => {
  const r = evaluateEntry("LONG", 14890, LV_LONG, EV_OK, GATES);
  assert.equal(r.state, "PREPARE");
  assert.equal(r.distanceToEntry, 10.25);
  assert.equal(r.approved, false); // GET READY is not an approval
});

test("LONG 14902 → ENTER (in the preferred zone, all gates pass)", () => {
  const r = evaluateEntry("LONG", 14902, LV_LONG, EV_OK, GATES);
  assert.equal(r.state, "ENTER");
  assert.equal(r.approved, true);
  assert.equal(r.lateEntry, false);
  assert.ok(r.remainingRR && r.remainingRR > 1); // full-zone R:R
});

test("LONG 14910 → ENTER_CONTINUATION (late) with reduced remaining R:R from 14910", () => {
  const r = evaluateEntry("LONG", 14910, LV_LONG, EV_OK, GATES);
  assert.equal(r.state, "ENTER_CONTINUATION");
  assert.equal(r.approved, true);
  assert.equal(r.lateEntry, true);
  const atZone = evaluateEntry("LONG", 14902, LV_LONG, EV_OK, GATES);
  assert.ok(r.remainingRR! < atZone.remainingRR!, "late-entry R:R is lower than at the preferred zone");
  assert.match(r.reason, /LATE ENTRY/);
});

test("LONG 14930 → WAIT_PULLBACK (too extended past the zone)", () => {
  const r = evaluateEntry("LONG", 14930, LV_LONG, EV_OK, GATES);
  assert.equal(r.state, "WAIT_PULLBACK");
  assert.equal(r.approved, false);
});

test("LONG 14910 with reversal evidence → NO ENTRY · REVERSAL_RISK", () => {
  const r = evaluateEntry("LONG", 14910, LV_LONG, { ...EV_OK, reversalSignals: 2 }, GATES);
  assert.equal(r.state, "REVERSAL_RISK");
  assert.equal(r.approved, false);
});

test("LONG late entry is R:R-gated: default (1.2×) rejects 14910 → WAIT_PULLBACK", () => {
  const r = evaluateEntry("LONG", 14910, LV_LONG, EV_OK, DEFAULT_ENTRY_GATES);
  assert.equal(r.state, "WAIT_PULLBACK"); // remaining R:R 0.84× < 1.2×
});

test("LONG hard invalidation → INVALIDATED (14840 ≤ 14842)", () => {
  assert.equal(evaluateEntry("LONG", 14840, LV_LONG, EV_OK, GATES).state, "INVALIDATED");
});

// ------------------------------------------------------------- freshness §15
test("stale CMP or stale evidence blocks a fresh ENTER (never a false LIVE approval)", () => {
  assert.equal(evaluateEntry("LONG", 14902, LV_LONG, { ...EV_OK, dataStale: true }, GATES).state, "BLOCKED_STALE");
  assert.equal(evaluateEntry("LONG", 14902, LV_LONG, { ...EV_OK, evidenceStale: true }, GATES).approved, false);
  assert.match(evaluateEntry("LONG", 14902, LV_LONG, { ...EV_OK, evidenceStale: true }, GATES).reason, /evidence/);
});

test("weak setup in the zone → WAIT_CONFIRMATION, never ENTER", () => {
  const r = evaluateEntry("LONG", 14902, LV_LONG, { ...EV_OK, winEstimate: 68 }, GATES);
  assert.equal(r.state, "WAIT_CONFIRMATION");
  assert.equal(r.approved, false);
});

// --------------------------------------------------------------- SHORT mirror §5
const LV_SHORT: LockedLevels = { entry: 14900.25, safeLow: 14894.9, safeHigh: 14900.25, stop: 14936.0, target1: 14852.1, invalidation: 14958.5, atr: 20 };

test("SHORT mirror: WAIT → GET READY → ENTER → CONTINUATION → PULLBACK → REVERSAL", () => {
  assert.equal(evaluateEntry("SHORT", 14950, LV_SHORT, EV_OK, GATES).state, "WAIT");
  assert.equal(evaluateEntry("SHORT", 14910, LV_SHORT, EV_OK, GATES).state, "PREPARE");
  assert.equal(evaluateEntry("SHORT", 14898, LV_SHORT, EV_OK, GATES).state, "ENTER");
  const cont = evaluateEntry("SHORT", 14890, LV_SHORT, EV_OK, GATES);
  assert.equal(cont.state, "ENTER_CONTINUATION");
  assert.equal(cont.lateEntry, true);
  assert.equal(evaluateEntry("SHORT", 14870, LV_SHORT, EV_OK, GATES).state, "WAIT_PULLBACK");
  assert.equal(evaluateEntry("SHORT", 14890, LV_SHORT, { ...EV_OK, reversalSignals: 2 }, GATES).state, "REVERSAL_RISK");
  assert.equal(evaluateEntry("SHORT", 14960, LV_SHORT, EV_OK, GATES).state, "INVALIDATED");
});

// -------------------------------------------------------- proximity / helpers
test("proximityDistance takes the LARGEST of points / % / ATR", () => {
  assert.equal(proximityDistance(14890, 20, { points: 12, pct: 0.08, atrMult: 0.5 }), 12); // 12 > 11.9 > 10
  assert.equal(proximityDistance(14890, 60, { points: 12, pct: 0.08, atrMult: 0.5 }), 30); // ATR 0.5×60 wins
  assert.equal(remainingRR(14902, 14948.4, 14864.5, true), 1.24);
  assert.equal(remainingRR(14910, 14948.4, 14864.5, true), 0.84); // reduced when late
});

// -------------------------------------------------------------- EXIT engine §20
const POS_LONG: PositionInput = { side: "LONG", entryPrice: 14902, stop: 14864.5, target1: 14948.4, invalidation: 14842.0 };

test("EXIT: hard stop is tick-driven — EXIT_NOW the instant CMP touches the stop", () => {
  assert.equal(evaluateExit(POS_LONG, 14864.5, 0, 5).state, "EXIT_NOW"); // exactly at the stop
  assert.equal(evaluateExit(POS_LONG, 14860, 0, 5).state, "EXIT_NOW"); // through the stop
  assert.equal(evaluateExit(POS_LONG, 14842, 0, 5).state, "EXIT_NOW"); // stop breached (also ≤ invalidation)
  // Invalidation reason surfaces when a gap opens BELOW the stop straight to it.
  const gapPos: PositionInput = { side: "LONG", entryPrice: 14902, stop: 14842.0, target1: 14948.4, invalidation: 14842.0 };
  assert.match(evaluateExit(gapPos, 14840, 0, 5).reason, /stop|invalidation/);
});

test("EXIT: HOLD / TRAIL / PARTIAL / EXIT_WARNING / EXIT_NOW by state", () => {
  assert.equal(evaluateExit(POS_LONG, 14895, 0, 5).state, "HOLD_CAUTION"); // small loss, no reversal
  assert.equal(evaluateExit(POS_LONG, 14920, 0, 5).state, "TRAIL_STOP"); // in profit
  assert.equal(evaluateExit(POS_LONG, 14948.4, 0, 5).state, "PARTIAL_PROFIT"); // target reached
  assert.equal(evaluateExit(POS_LONG, 14920, 3, 5).state, "EXIT_WARNING"); // 60% < 75%
  assert.equal(evaluateExit(POS_LONG, 14920, 4, 5).state, "EXIT_NOW"); // 80% ≥ 75%
});

// --------------------------------------------------- locked-plan invariance §21
test("locked levels are NEVER mutated across a full tick replay (byte-for-byte)", () => {
  const frozen: LockedLevels = Object.freeze({ ...LV_LONG }); // throws on any write attempt
  const before = JSON.stringify(frozen);
  for (const cmp of [14850, 14890, 14902, 14910, 14930, 14840, 14960, 15010]) {
    assert.doesNotThrow(() => evaluateEntry("LONG", cmp, frozen, EV_OK, GATES));
  }
  assert.equal(JSON.stringify(frozen), before); // identical after the replay
});

// ------------------------------------------------- distinct notification states §17
test("the acceptance sequence yields DISTINCT states (dedup-friendly transitions)", () => {
  const seq = [14850, 14890, 14902, 14910, 14930].map((c) => evaluateEntry("LONG", c, LV_LONG, EV_OK, GATES).state);
  assert.deepEqual(seq, ["WAIT", "PREPARE", "ENTER", "ENTER_CONTINUATION", "WAIT_PULLBACK"]);
  assert.equal(new Set(seq).size, 5); // every transition is a distinct, dedup-able state
});
