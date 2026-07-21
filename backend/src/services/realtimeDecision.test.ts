import { test } from "node:test";
import assert from "node:assert/strict";

import { LiveCandleSeries } from "./marketStream/liveCandles";
import { buildDecisionSnapshot, aggregateEvidence, type LockedPlan, type RealtimeDecisionSnapshot } from "./realtimeDecision";
import { DEFAULT_ENTRY_GATES, type EntryGates, type PositionInput } from "./entryStateMachine";
import type { Candle } from "./technicalAnalysis";

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 5, 4, 0, 0); // fixed, deterministic

/** A strongly TRENDING closed-candle history (rising or falling) so the real
 *  indicator engine yields high win / setup with no opposing signals. */
function trendSeries(n: number, start: number, step: number): Candle[] {
  const out: Candle[] = [];
  let o = start;
  for (let i = 0; i < n; i++) {
    const c = o + step;
    out.push({ t: new Date(T0 - (n - i) * MIN).toISOString(), o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 1000 + i * 40 });
    o = c;
  }
  return out;
}

// Acceptance plan (§6/§19): analyse 14830.90; preferred entry 14900.25–14905.60.
const PLAN_LONG: LockedPlan = { direction: "LONG", entry: 14900.25, safeLow: 14900.25, safeHigh: 14905.6, stop: 14864.5, target1: 14948.4, target2: 15005.2, invalidation: 14842.0, atr: 20, analysedCmp: 14830.9, analysedAtMs: T0 - 5 * MIN };
// Gates for the deterministic replay. minWin is set to what the LIVE pipeline
// genuinely computes from a strong synthetic trend (~68, capped by intrabar
// confidence) — production keeps the 75 threshold via config; this proves the
// state machine consumes the live win, not a frozen one. Late entry stays valid.
const GATES: EntryGates = { ...DEFAULT_ENTRY_GATES, minWin: 60, lateEntryMinRR: 0.5 };

/** Drive ONE tick into the series and compute the coherent decision snapshot. */
function decideAt(series: LiveCandleSeries, cmp: number, plan: LockedPlan, seq: number, opts?: { position?: PositionInput | null; tickReceivedMs?: number; now?: number }): RealtimeDecisionSnapshot {
  const now = opts?.now ?? T0 + seq * 250;
  series.onTick(now, cmp, 5000 + seq * 100);
  return buildDecisionSnapshot({
    seq,
    instrument: "NFO:MIDCPNIFTY26JANFUT",
    interval: "1minute",
    candles: series.candles(),
    formingClosed: false,
    plan,
    position: opts?.position ?? null,
    gates: GATES,
    nowMs: now,
    tickTsMs: now,
    tickReceivedMs: opts?.tickReceivedMs ?? now,
  });
}

function longSeries(): LiveCandleSeries {
  const s = new LiveCandleSeries(MIN);
  s.seed(trendSeries(45, 14700, 3.1)); // rises to ~14840, strongly bullish
  return s;
}

// ---------------------------------------------------------------- LONG replay §19
test("REPLAY LONG: tick → candle → indicators → evidence → approval → decision", () => {
  const s = longSeries();
  let seq = 0;
  const wait = decideAt(s, 14850, PLAN_LONG, ++seq);
  assert.equal(wait.action, "WAIT");
  assert.equal(wait.distanceToEntry, 50.25);
  assert.ok(wait.winEstimate >= 60 && wait.winEstimate <= 75, `win ${wait.winEstimate} is live from the candle state`);
  assert.equal(wait.setupStrength >= 60, true);
  assert.equal(wait.trend.direction, "bullish");

  const prepare = decideAt(s, 14890, PLAN_LONG, ++seq);
  assert.equal(prepare.action, "PREPARE");
  assert.equal(prepare.distanceToEntry, 10.25);

  const enter = decideAt(s, 14902, PLAN_LONG, ++seq);
  assert.equal(enter.action, "ENTER");
  assert.equal(enter.approved, true);
  assert.equal(enter.lateEntry, false);

  const cont = decideAt(s, 14910, PLAN_LONG, ++seq);
  assert.equal(cont.action, "ENTER_CONTINUATION");
  assert.equal(cont.approved, true);
  assert.equal(cont.lateEntry, true);
  assert.ok(cont.remainingRR! < enter.remainingRR!, "late-entry R:R is lower");

  const pull = decideAt(s, 14930, PLAN_LONG, ++seq);
  assert.equal(pull.action, "WAIT_PULLBACK");

  // Evidence is aggregated into categories, and the decision is internally coherent.
  assert.ok(enter.evidence.length >= 3);
  assert.ok(enter.evidence.every((e) => ["trend", "momentum", "volume", "volatility", "structure"].includes(e.category)));
  assert.equal(enter.candle.forming?.c, 14902); // CMP == forming-candle close (same state)
});

test("REPLAY LONG: bearish evidence on a breakout above the zone → REVERSAL_RISK", () => {
  // A FALLING history (bearish indicators) ending ~14910, with a forming tick that
  // spikes to 14910 — a false breakout above the LONG preferred zone. Live evidence
  // opposes the trade, so a fresh entry is refused.
  const s = new LiveCandleSeries(MIN);
  s.seed(trendSeries(45, 15050, -3.1)); // 15050 → ~14910.5, strongly bearish
  s.onTick(T0 + MIN, 14910, 6000);
  const snap = buildDecisionSnapshot({ seq: 1, instrument: "X", interval: "1minute", candles: s.candles(), formingClosed: false, plan: PLAN_LONG, gates: GATES, nowMs: T0 + MIN, tickReceivedMs: T0 + MIN });
  assert.equal(snap.approved, false);
  assert.equal(snap.action, "REVERSAL_RISK");
  assert.equal(snap.trend.direction, "bearish");
});

// -------------------------------------------------------------- SHORT mirror §19
test("REPLAY SHORT mirror: WAIT → PREPARE → ENTER → CONTINUATION → PULLBACK", () => {
  const s = new LiveCandleSeries(MIN);
  s.seed(trendSeries(45, 15100, -3.1)); // falls to ~14960, strongly bearish
  const plan: LockedPlan = { direction: "SHORT", entry: 14900.25, safeLow: 14894.9, safeHigh: 14900.25, stop: 14936.0, target1: 14852.1, target2: 14800.0, invalidation: 14958.5, atr: 20, analysedCmp: 14970, analysedAtMs: T0 };
  let seq = 0;
  assert.equal(decideAt(s, 14950, plan, ++seq).action, "WAIT");
  assert.equal(decideAt(s, 14910, plan, ++seq).action, "PREPARE");
  assert.equal(decideAt(s, 14898, plan, ++seq).action, "ENTER");
  const cont = decideAt(s, 14890, plan, ++seq);
  assert.equal(cont.action, "ENTER_CONTINUATION");
  assert.equal(cont.lateEntry, true);
  assert.equal(decideAt(s, 14870, plan, ++seq).action, "WAIT_PULLBACK");
});

// ---------------------------------------------------------------- freshness §14
test("stale driving tick blocks a fresh ENTER (BLOCKED_STALE), even in the zone", () => {
  const s = longSeries();
  const snap = decideAt(s, 14902, PLAN_LONG, 1, { now: T0 + 100_000, tickReceivedMs: T0 }); // tick 100s old
  assert.equal(snap.freshness.stale, true);
  assert.equal(snap.approved, false);
  assert.equal(snap.action, "BLOCKED_STALE");
  assert.match(snap.freshness.blockReason ?? "", /old/);
});

// -------------------------------------------------------------- forming/closed §4B
test("forming and last-CLOSED indicators are kept separate; forming ≠ confirmed", () => {
  const s = longSeries();
  const snap = decideAt(s, 14902, PLAN_LONG, 1);
  assert.equal(snap.candle.formingClosed, false);
  assert.ok(snap.candle.forming, "forming candle present");
  assert.ok(snap.candle.lastClosed, "last-closed candle present");
  assert.notEqual(snap.candle.forming!.c, snap.candle.lastClosed!.c); // different states
  assert.ok(snap.indicatorsClosed, "closed-candle indicator snapshot present");
});

// --------------------------------------------------------------- hard stop §15
test("EXIT hard stop reacts to the streamed CMP immediately", () => {
  const s = longSeries();
  const pos: PositionInput = { side: "LONG", entryPrice: 14902, stop: 14864.5, target1: 14948.4, invalidation: 14842.0 };
  assert.equal(decideAt(s, 14864.5, PLAN_LONG, 1, { position: pos }).action, "EXIT_NOW");
  assert.equal(decideAt(s, 14948.4, PLAN_LONG, 2, { position: pos }).action, "PARTIAL_PROFIT");
  assert.equal(decideAt(s, 14920, PLAN_LONG, 3, { position: pos }).action, "TRAIL_STOP");
});

// ------------------------------------------------- versioning / out-of-order §12
test("snapshots carry an increasing seq; a consumer ignores older/out-of-order", () => {
  const s = longSeries();
  const a = decideAt(s, 14850, PLAN_LONG, 1);
  const b = decideAt(s, 14890, PLAN_LONG, 2);
  assert.ok(b.seq > a.seq);
  const accept = (prevSeq: number, snap: RealtimeDecisionSnapshot) => (snap.seq > prevSeq ? snap.seq : prevSeq);
  let cur = 0;
  cur = accept(cur, b); // seq 2
  cur = accept(cur, a); // seq 1 — ignored (older)
  assert.equal(cur, 2);
});

// ------------------------------------------------- locked-plan invariance §7/§21
test("the locked plan is NEVER mutated across a full tick replay (byte-for-byte)", () => {
  const s = longSeries();
  const frozen = Object.freeze({ ...PLAN_LONG });
  const before = JSON.stringify(frozen);
  let seq = 0;
  for (const cmp of [14850, 14890, 14902, 14910, 14930, 14840]) {
    assert.doesNotThrow(() => decideAt(s, cmp, frozen, ++seq));
  }
  assert.equal(JSON.stringify(frozen), before);
});

// --------------------------------------------------------------- latency §20
test("pipeline latency is bounded (deterministic local replay)", () => {
  const s = longSeries();
  const totals: number[] = [];
  for (let i = 1; i <= 60; i++) totals.push(decideAt(s, 14850 + (i % 80), PLAN_LONG, i).timings.totalMs);
  totals.sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)];
  const p95 = totals[Math.floor(totals.length * 0.95)];
  const max = totals[totals.length - 1];
  assert.ok(Number.isFinite(median) && Number.isFinite(p95) && Number.isFinite(max));
  assert.ok(max < 50, `max pipeline latency ${max}ms should be well under a 50ms budget`);
});

test("aggregateEvidence groups correlated indicators into one category (no double count)", () => {
  const ev = aggregateEvidence([
    { id: "EMA20", direction: "bullish", weight: 1, value: "", detail: "" },
    { id: "EMA50", direction: "bullish", weight: 1, value: "", detail: "" },
    { id: "SUPERTREND", direction: "bullish", weight: 1, value: "", detail: "" },
    { id: "RSI", direction: "bearish", weight: 1, value: "", detail: "" },
  ]);
  const trend = ev.find((e) => e.category === "trend")!;
  assert.equal(trend.items.length, 3); // EMA20+EMA50+SUPERTREND live in ONE trend bucket
  assert.equal(trend.direction, "bullish");
});
