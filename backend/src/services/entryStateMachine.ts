// =====================================================================
// Entry / Exit decision state machine — PURE, direction-aware, numeric.
// ---------------------------------------------------------------------
// This is the tested authority for the real-time WAIT → PREPARE → ENTER →
// CONTINUATION / PULLBACK / REVERSAL flow and the HOLD → … → EXIT flow. It
// operates over already-extracted NUMBERS (the LOCKED levels + a live evidence
// snapshot + config gates) so every transition is deterministic and unit-testable
// without a Kite stream. The frontend `lib/tradePlan.ts` mirrors this exact logic
// for the live UI; this module + its tests pin the contract.
//
// Levels are LOCKED at Analyse and are NEVER mutated here — the machine only reads
// them against the CURRENT price. "Real-time" means CMP / distance / approval /
// state change per tick; the levels do not.
// =====================================================================

export type EntrySide = "LONG" | "SHORT";

export type EntryState =
  | "WAIT" // below/above the trigger, not yet near
  | "PREPARE" // within proximity of the preferred entry, setup still valid
  | "ENTER" // in the preferred zone, all gates pass
  | "ENTER_CONTINUATION" // above/below the zone, continuation valid (late entry)
  | "WAIT_PULLBACK" // extended past the zone / remaining R:R too low
  | "REVERSAL_RISK" // live evidence turned against the trade
  | "WAIT_CONFIRMATION" // reached but gates not (yet) satisfied
  | "INVALIDATED" // broke the hard invalidation
  | "BLOCKED_STALE"; // gates pass but critical data / evidence is stale

export type ExitState = "HOLD" | "HOLD_CAUTION" | "TRAIL_STOP" | "PARTIAL_PROFIT" | "EXIT_WARNING" | "EXIT_NOW";

export interface LockedLevels {
  entry: number;
  safeLow: number; // preferred-entry range low
  safeHigh: number; // preferred-entry range high
  stop: number; // protective stop
  target1: number;
  invalidation: number; // hard invalidation
  atr: number | null;
}

export interface EvidenceSnapshot {
  winEstimate: number; // backend win probability (locked at analyse)
  setupStrength: number; // % indicator confirmation (locked at analyse)
  /** Count of live signals firing AGAINST the trade (Supertrend flip, lost VWAP,
   *  RSI, MACD, EMA-structure, …). >=2 ⇒ reversal risk. */
  reversalSignals: number;
  dataStale: boolean; // CMP/quote/candle stale
  evidenceStale: boolean; // indicators/decision stale (§15)
}

export interface EntryGates {
  minWin: number;
  minSetup: number;
  continuationAtrMult: number; // max ATRs past the zone still eligible for continuation
  lateEntryMinRR: number; // min remaining R:R for a late continuation entry
  prepare: { points: number; pct: number; atrMult: number };
}

export const DEFAULT_ENTRY_GATES: EntryGates = {
  minWin: 75,
  minSetup: 60,
  continuationAtrMult: 0.75,
  lateEntryMinRR: 1.2,
  prepare: { points: 12, pct: 0.08, atrMult: 0.5 },
};

export interface EntryResult {
  state: EntryState;
  approved: boolean; // true only for ENTER / ENTER_CONTINUATION
  lateEntry: boolean;
  distanceToEntry: number; // signed: >0 = still to travel to reach entry
  remainingRR: number | null; // reward/risk from the CURRENT price
  reason: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Proximity distance for PREPARE: the largest of points / %-of-price / ATR-rel. */
export function proximityDistance(cmp: number, atr: number | null, prep: EntryGates["prepare"]): number {
  const byPct = (prep.pct / 100) * cmp;
  const byAtr = atr != null && atr > 0 ? prep.atrMult * atr : 0;
  return Math.max(prep.points, byPct, byAtr);
}

/** Remaining reward/risk entering at the CURRENT price (reward→T1 over risk→stop). */
export function remainingRR(cmp: number, target1: number, stop: number, long: boolean): number | null {
  const reward = long ? target1 - cmp : cmp - target1;
  const risk = long ? cmp - stop : stop - cmp;
  if (!(risk > 0) || reward <= 0) return null;
  return r2(reward / risk);
}

/**
 * Evaluate the ENTRY state for a NO-POSITION scan. Direction-aware; the locked
 * levels never move. Order of precedence: invalidation → not-reached (WAIT /
 * PREPARE) → beyond-zone (reversal → pullback → continuation) → in-zone (ENTER).
 * A fresh ENTER is blocked when CMP OR evidence is stale (§15) — never a false
 * "approved" on stale data.
 */
export function evaluateEntry(side: EntrySide, cmp: number, lv: LockedLevels, ev: EvidenceSnapshot, gates: EntryGates = DEFAULT_ENTRY_GATES): EntryResult {
  const long = side === "LONG";
  const distanceToEntry = r2(long ? lv.entry - cmp : cmp - lv.entry);
  const rr = remainingRR(cmp, lv.target1, lv.stop, long);
  const setupValid = ev.winEstimate >= gates.minWin && ev.setupStrength >= gates.minSetup;
  const staleReason = ev.dataStale ? "live price/candle data is stale" : "approval evidence (indicators) is stale";
  const freshBlocked = ev.dataStale || ev.evidenceStale;
  const base = { distanceToEntry, remainingRR: rr, approved: false, lateEntry: false };

  // Hard invalidation first — the plan is void.
  if (long ? cmp <= lv.invalidation : cmp >= lv.invalidation) {
    return { ...base, state: "INVALIDATED", reason: `CMP ${cmp} broke the hard invalidation ${lv.invalidation}. Re-analyse for a fresh plan.` };
  }

  const reached = long ? cmp >= lv.entry : cmp <= lv.entry;
  const inZone = cmp >= lv.safeLow && cmp <= lv.safeHigh;
  const past = long ? cmp > lv.safeHigh : cmp < lv.safeLow;

  if (!reached) {
    const dist = Math.abs(distanceToEntry);
    if (setupValid && dist <= proximityDistance(cmp, lv.atr, gates.prepare)) {
      return { ...base, state: "PREPARE", reason: `Preferred entry ${lv.entry} is approaching (${r2(dist)} pts). ${long ? "Bullish" : "Bearish"} conditions remain valid.` };
    }
    return { ...base, state: "WAIT", reason: `Wait until price ${long ? "breaks above" : "breaks below"} ${lv.entry} (${r2(dist)} pts away).` };
  }

  if (past) {
    const edge = long ? lv.safeHigh : lv.safeLow;
    const beyond = long ? cmp - edge : edge - cmp;
    const beyondAtr = lv.atr != null && lv.atr > 0 ? beyond / lv.atr : null;
    const dirWord = long ? "above" : "below";

    if (ev.reversalSignals >= 2) {
      return { ...base, state: "REVERSAL_RISK", reason: `Breakout failed ${dirWord} the zone — ${ev.reversalSignals} reversal signals firing. Do not enter.` };
    }
    if ((beyondAtr != null && beyondAtr > gates.continuationAtrMult) || (rr != null && rr < gates.lateEntryMinRR)) {
      const why = beyondAtr != null && beyondAtr > gates.continuationAtrMult ? `Price is ${r2(beyondAtr)} ATR ${dirWord} the preferred entry range` : `Remaining reward/risk from ${cmp} is ${rr}× (< ${gates.lateEntryMinRR}×)`;
      return { ...base, state: "WAIT_PULLBACK", reason: `${why}. Trend intact but remaining reward/risk is reduced — wait for a pullback toward ${lv.entry}.` };
    }
    if (setupValid) {
      if (freshBlocked) return { ...base, state: "BLOCKED_STALE", reason: `Continuation looks valid but ${staleReason} — entry blocked until fresh data arrives.` };
      return { ...base, state: "ENTER_CONTINUATION", approved: true, lateEntry: true, reason: `LATE ENTRY: CMP is ${r2(beyond)} pts ${dirWord} the preferred zone — remaining profit is lower (R:R ${rr ?? "—"}×). Evidence supportive, no reversal.` };
    }
    return { ...base, state: "WAIT_CONFIRMATION", reason: `Past the zone but the setup is not confirmed (win ${ev.winEstimate}% / setup ${ev.setupStrength}%).` };
  }

  if (inZone) {
    if (!setupValid) {
      return { ...base, state: "WAIT_CONFIRMATION", reason: `In the preferred zone but win ${ev.winEstimate}% (≥${gates.minWin}%) / setup ${ev.setupStrength}% (≥${gates.minSetup}%) not both met.` };
    }
    if (freshBlocked) return { ...base, state: "BLOCKED_STALE", reason: `In the preferred zone and gates pass, but ${staleReason} — entry blocked until fresh data arrives.` };
    return { ...base, state: "ENTER", approved: true, reason: `Approved: win ${ev.winEstimate}%, setup ${ev.setupStrength}%, CMP in the preferred zone. Enter with stop ${lv.stop}.` };
  }

  // Reached the trigger but between it and the safe-zone boundary (rare) — wait.
  return { ...base, state: "WAIT_CONFIRMATION", reason: `Reached ${lv.entry} but not yet inside the preferred zone.` };
}

export interface PositionInput {
  side: EntrySide;
  entryPrice: number; // actual tracked fill
  stop: number;
  target1: number;
  invalidation: number;
}

export interface ExitResult {
  state: ExitState;
  approved: boolean; // true only for a HARD exit / partial book
  pnlPts: number;
  reason: string;
}

/**
 * Evaluate the EXIT state for a TRACKED position. Hard stop / hard invalidation
 * are evaluated DIRECTLY from the current tick (no polling wait). `reversalSignals`
 * is the live count against the position; `minExitConfPct` gates a soft exit.
 */
export function evaluateExit(pos: PositionInput, cmp: number, reversalSignals: number, reversalTotal: number, minExitConfPct = 75): ExitResult {
  const long = pos.side === "LONG";
  const pnlPts = r2(long ? cmp - pos.entryPrice : pos.entryPrice - cmp);
  const hardStopHit = long ? cmp <= pos.stop : cmp >= pos.stop;
  const invalidated = long ? cmp <= pos.invalidation : cmp >= pos.invalidation;
  const targetHit = long ? cmp >= pos.target1 : cmp <= pos.target1;
  const exitConf = hardStopHit || invalidated ? 100 : reversalTotal > 0 ? Math.round((reversalSignals / reversalTotal) * 100) : 0;

  if (hardStopHit) return { state: "EXIT_NOW", approved: true, pnlPts, reason: `Hard stop ${pos.stop} hit — exit now to cap the loss.` };
  if (invalidated) return { state: "EXIT_NOW", approved: true, pnlPts, reason: `Hard invalidation ${pos.invalidation} breached — exit now.` };
  if (exitConf >= minExitConfPct && reversalSignals > 0) return { state: "EXIT_NOW", approved: true, pnlPts, reason: `Exit: ${reversalSignals}/${reversalTotal} reversal signals (${exitConf}% ≥ ${minExitConfPct}%).` };
  if (targetHit) return { state: "PARTIAL_PROFIT", approved: true, pnlPts, reason: `Target ${pos.target1} reached — book partial and trail the rest.` };
  if (reversalSignals > 0) return { state: "EXIT_WARNING", approved: false, pnlPts, reason: `Warning: ${reversalSignals}/${reversalTotal} reversal signals — tighten stop / reduce. Full exit needs ≥${minExitConfPct}%.` };
  if (pnlPts > 0) return { state: "TRAIL_STOP", approved: false, pnlPts, reason: `In profit (${pnlPts} pts) — trail the stop while structure holds.` };
  return { state: "HOLD_CAUTION", approved: false, pnlPts, reason: `Holding against stop ${pos.stop}. Exit only on a break or ≥${minExitConfPct}% reversal confidence.` };
}
