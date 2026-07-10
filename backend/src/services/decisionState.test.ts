import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTransition, _reset, _setClock, type Proposal, type LoopAction, type LoopState } from "./decisionState";

function prop(action: LoopAction, state: LoopState, critical = false): Proposal {
  return { action, state, critical, reason: "t", cmp: 100, trigger: null, confidence: 80, winEstimate: 80, vix: null, newsScore: 0, marketTrend: "UPTREND", supporting: [], blocking: [] };
}

test("non-critical change needs confirmations before it commits (anti-flicker)", () => {
  _reset();
  let now = 1_000_000;
  _setClock(() => now);
  // First ENTER proposal — pending, not yet committed (still IDLE / NO ACTION).
  let r = applyTransition("K", prop("ENTER", "ENTRY_APPROVED"));
  assert.equal(r.action, "NO ACTION");
  assert.equal(r.pending?.count, 1);
  // Second consecutive proposal commits.
  now += 3000;
  r = applyTransition("K", prop("ENTER", "ENTRY_APPROVED"));
  assert.equal(r.action, "ENTER");
  assert.equal(r.state, "ENTRY_APPROVED");
  assert.ok(r.history.length >= 1);
  assert.equal(r.history.at(-1)?.toAction, "ENTER");
  _setClock();
});

test("critical exit commits immediately; cooldown then blocks a fresh ENTER", () => {
  _reset();
  let now = 2_000_000;
  _setClock(() => now);
  // Confirmed EXIT is critical → one tick.
  let r = applyTransition("K2", prop("EXIT", "EXIT_APPROVED", true));
  assert.equal(r.action, "EXIT");
  assert.equal(r.state, "EXIT_APPROVED");
  // During cooldown (default 120s), repeated ENTER proposals are suppressed.
  for (let k = 0; k < 5; k++) {
    now += 20_000; // 100s total < 120s cooldown
    r = applyTransition("K2", prop("ENTER", "ENTRY_APPROVED"));
  }
  assert.notEqual(r.action, "ENTER");
  // After cooldown elapses, ENTER can be confirmed again.
  now += 40_000; // > 120s since exit
  applyTransition("K2", prop("ENTER", "ENTRY_APPROVED"));
  now += 20_000;
  r = applyTransition("K2", prop("ENTER", "ENTRY_APPROVED"));
  assert.equal(r.action, "ENTER");
  _setClock();
});
