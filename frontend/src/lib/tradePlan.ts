// Locked Trade Plan model (Phase 3R).
//
// A trade plan (entry / safe-entry zone / stop-loss / targets / trail /
// invalidation / confidence) is computed ONCE at analysis time and LOCKED. Live
// CMP and live indicators keep updating, but the planned levels do NOT move with
// every tick — they change only on Re-analyse, a timeframe/mode/instrument
// change, or setup invalidation.
//
// Action approval is strict: ENTER NOW / EXIT NOW require >= 75% confidence
// (MIN_ACTION_CONFIDENCE). Below that the plan shows WAIT FOR CONFIRMATION /
// HOLD WITH CAUTION / DO NOT CHASE / AVOID instead of an approval.
//
// Entry comes from chart structure (the backend's breakout/structure setup) with
// an ATR buffer zone — never directly from CMP. Advisory only; no fabrication.

import type { LiveSignal } from "@/types/api";

// Final ENTER approval requires ALL of: backend win estimate >= MIN_WIN_ESTIMATE,
// locked indicator setup strength >= MIN_SETUP_STRENGTH, setup not invalidated,
// and CMP inside the safe entry zone. EXIT NOW needs a hard-stop breach or live
// exit confidence >= MIN_EXIT_CONFIDENCE.
export const MIN_WIN_ESTIMATE = 75; // backend win probability needed to approve
export const MIN_SETUP_STRENGTH = 60; // % of indicator checks that must confirm
export const MIN_EXIT_CONFIDENCE = 75;

export type PlanDirection = "LONG" | "SHORT" | "WAIT";

export interface GuidanceCheck {
  label: string;
  met: boolean | null; // true = confirms, false = against, null = unavailable
}

export interface TradePlanSnapshot {
  instrument: string;
  displayName: string;
  timeframe: string;
  mode: string;
  generatedAt: number;
  direction: PlanDirection;
  entry: number | null;
  safeLow: number | null;
  safeHigh: number | null;
  stopLoss: number | null;
  targets: (number | null)[];
  trailStop: number | null;
  invalidation: number | null;
  winEstimate: number; // backend win probability, LOCKED at generation
  setupStrength: number; // % of indicator checks confirmed at generation, LOCKED
  riskReward: string | null;
  reason: string;
  cmpAtGen: number;
  checks: GuidanceCheck[];
  snapshot: {
    vwap: number | null;
    ema20: number | null;
    ema50: number | null;
    rsi: number | null;
    supertrend: "bullish" | "bearish" | null;
    atr: number | null;
    support1: number;
    resistance1: number;
    bullishPercent: number;
    bearishPercent: number;
    dataQuality: string;
  };
  disclaimer: string;
}

export type PlanState =
  | "ENTER_NOW"
  | "WAIT_BREAKOUT"
  | "WAIT_PULLBACK"
  | "WAIT_CONFIRMATION"
  | "WAIT_SETUP"
  | "REVERSAL_RISK"
  | "AVOID"
  | "INVALIDATED"
  | "HOLD"
  | "HOLD_CAUTION"
  | "BOOK_PARTIAL"
  | "TRAIL_SL"
  | "EXIT_NOW"
  | "REDUCE_RISK";

export type PlanTone = "bull" | "bear" | "warn" | "info" | "neutral";

export interface PlanPosition {
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  stopLoss: number | null;
  target: number | null;
  source: "ai-virtual" | "zerodha";
}

export interface PlanEval {
  state: PlanState;
  label: string;
  approved: boolean; // true only for ENTER/EXIT/BOOK at/over threshold or hard level
  /** Final tradable approval (0..100) computed LIVE; 0 when no action is approved. */
  currentApproval: number;
  approvalLabel: string; // e.g. "Approved", "No approval", "Invalidated", "Wait"
  tone: PlanTone;
  reason: string;
  cmp: number | null;
  distToEntry: number | null;
  distToStop: number | null;
  distToTarget: number | null;
  exitConfidence: number | null;
  pnlPerUnit: number | null;
  pnlPercent: number | null;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
function f(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Indicator confirmation checklist for a direction, evaluated at snapshot time. */
export function confirmationChecks(s: LiveSignal, side: "LONG" | "SHORT"): GuidanceCheck[] {
  const long = side === "LONG";
  const i = s.indicators;
  const vwap = s.marketData.vwap;
  const price = s.currentPrice;
  const cmp = (a: number, b: number) => (long ? a > b : a < b);
  return [
    { label: vwap != null ? `Price ${long ? "above" : "below"} VWAP ₹${f(vwap)}` : "Price vs VWAP", met: vwap != null ? cmp(price, vwap) : null },
    { label: `EMA20 ${long ? "above" : "below"} EMA50 (${long ? "up" : "down"}trend)`, met: i.ema20 != null && i.ema50 != null ? cmp(i.ema20, i.ema50) : null },
    { label: `RSI ${long ? "above 50" : "below 50"}${i.rsi != null ? ` — ${f(i.rsi)}` : ""}`, met: i.rsi != null ? (long ? i.rsi > 50 : i.rsi < 50) : null },
    { label: `MACD histogram ${long ? "positive" : "negative"}`, met: i.macd != null ? (long ? i.macd.histogram > 0 : i.macd.histogram < 0) : null },
    { label: `Supertrend ${long ? "bullish" : "bearish"}${i.supertrend != null ? ` (₹${f(i.supertrend.value)})` : ""}`, met: i.supertrend != null ? i.supertrend.direction === (long ? "bullish" : "bearish") : null },
    { label: `ADX above 20${i.adx != null ? ` — ${f(i.adx.adx)}` : ""}`, met: i.adx != null ? i.adx.adx > 20 : null },
    { label: "Volume confirms the move", met: i.volumeConfirmed },
  ];
}

/** Locked indicator-checklist strength: % of AVAILABLE checks that confirmed.
 *  This is "Initial setup strength" — distinct from the backend win estimate. */
export function setupStrength(checks: GuidanceCheck[]): number {
  const avail = checks.filter((c) => c.met != null);
  if (avail.length === 0) return 0;
  return Math.round((avail.filter((c) => c.met === true).length / avail.length) * 100);
}

/** Build a LOCKED plan snapshot from a signal (called on Analyze / Re-analyse). */
export function buildTradePlan(s: LiveSignal, timeframe: string, mode: string): TradePlanSnapshot {
  const action = s.finalDecision.action;
  const direction: PlanDirection =
    action === "LONG" ? "LONG" : action === "SHORT" ? "SHORT" : s.preferredSetup === "long" ? "LONG" : s.preferredSetup === "short" ? "SHORT" : "WAIT";

  const base = {
    instrument: s.instrument,
    displayName: s.resolvedInstrument.displayName || s.instrument,
    timeframe,
    mode,
    generatedAt: Date.now(),
    cmpAtGen: s.currentPrice,
    reason: s.finalDecision.reason,
    invalidation: s.finalDecision.invalidationLevel,
    disclaimer: s.disclaimer,
    snapshot: {
      vwap: s.marketData.vwap,
      ema20: s.indicators.ema20,
      ema50: s.indicators.ema50,
      rsi: s.indicators.rsi,
      supertrend: s.indicators.supertrend?.direction ?? null,
      atr: s.indicators.atr,
      support1: s.levels.support1,
      resistance1: s.levels.resistance1,
      bullishPercent: s.probability.bullishPercent,
      bearishPercent: s.probability.bearishPercent,
      dataQuality: s.probability.dataQuality,
    },
  };

  if (direction === "WAIT") {
    return {
      ...base,
      direction: "WAIT",
      entry: null,
      safeLow: null,
      safeHigh: null,
      stopLoss: null,
      targets: [null, null, null],
      trailStop: null,
      winEstimate: 0,
      setupStrength: 0,
      riskReward: null,
      checks: confirmationChecks(s, "LONG"),
    };
  }

  const long = direction === "LONG";
  const setup = long ? s.longSetup : s.shortSetup;
  const atr = s.indicators.atr;
  // Entry = the backend's chart-structure breakout level (NOT CMP).
  const entry = (long ? setup.entryAbove : setup.entryBelow) ?? null;
  const span = Math.abs(setup.target1 - (entry ?? s.currentPrice));
  const buffer = atr != null && atr > 0 ? Math.min(0.5 * atr, 0.25 * span) : Math.max(0.25 * span, (entry ?? s.currentPrice) * 0.003);
  const b = buffer > 0 ? buffer : (entry ?? s.currentPrice) * 0.003;
  const safeLow = entry == null ? null : long ? entry : r2(entry - b);
  const safeHigh = entry == null ? null : long ? r2(entry + b) : entry;
  const checks = confirmationChecks(s, long ? "LONG" : "SHORT");
  const trail = atr != null && atr > 0 ? r2(long ? Math.max(s.currentPrice - atr, setup.stopLoss) : Math.min(s.currentPrice + atr, setup.stopLoss)) : setup.stopLoss;

  return {
    ...base,
    direction,
    entry,
    safeLow,
    safeHigh,
    stopLoss: setup.stopLoss,
    targets: [setup.target1, setup.target2, setup.target3],
    trailStop: trail,
    winEstimate: s.probability.estimatedWinPercent,
    setupStrength: setupStrength(checks),
    riskReward: setup.riskReward,
    checks,
  };
}

export type EntryZone = "approach" | "inside" | "beyond";

export interface PointsToAction {
  direction: PlanDirection;
  cmp: number | null;
  /** Direction-aware distance to the locked entry. Positive = price still has to
   *  travel to REACH entry (LONG: entry−CMP; SHORT: CMP−entry). Negative = beyond. */
  pointsToEntry: number | null;
  entryZone: EntryZone | null;
  entryLabel: string; // "5.85 pts to entry" / "In entry zone" / "3.20 pts past entry"
  /** Cushion from CMP to the stop in the trade direction (positive = room left). */
  pointsToStop: number | null;
  /** Remaining points to Target-1 in the trade direction (positive = not yet hit). */
  pointsToTarget1: number | null;
  /** liveCMP − analysedCMP (raw signed), when an analysis baseline is available. */
  movementSinceAnalysis: number | null;
}

/** 2-dp, sign-free points string (e.g. 5.85). */
function pts(n: number): string {
  return f(r2(Math.abs(n)));
}

/**
 * Direction-aware "points to action" for a LOCKED plan against live CMP. Entry
 * distance is signed by trade direction so a LONG below entry and a SHORT above
 * entry both read as positive "pts to entry"; inside the safe zone it reads "In
 * entry zone"; beyond the zone (in the trade direction) it reads "past entry"
 * and the caller decides continuation vs pullback. Pure — no live recompute of
 * the locked levels.
 */
export function computePointsToAction(plan: TradePlanSnapshot, cmp: number | null, analysedCmp: number | null): PointsToAction {
  const long = plan.direction === "LONG";
  const base: PointsToAction = {
    direction: plan.direction,
    cmp,
    pointsToEntry: null,
    entryZone: null,
    entryLabel: "—",
    pointsToStop: null,
    pointsToTarget1: null,
    movementSinceAnalysis: cmp != null && analysedCmp != null ? r2(cmp - analysedCmp) : null,
  };
  if (cmp == null || plan.direction === "WAIT") return base;

  if (plan.entry != null) {
    const toEntry = r2(long ? plan.entry - cmp : cmp - plan.entry);
    base.pointsToEntry = toEntry;
    // Zone relative to the safe entry band, in trade-progress terms.
    const lo = plan.safeLow;
    const hi = plan.safeHigh;
    let zone: EntryZone;
    if (lo != null && hi != null) {
      if (cmp >= lo && cmp <= hi) zone = "inside";
      else if (long ? cmp > hi : cmp < lo) zone = "beyond"; // past the zone in the trade direction
      else zone = "approach";
    } else {
      zone = (long ? cmp >= plan.entry : cmp <= plan.entry) ? "beyond" : "approach";
    }
    base.entryZone = zone;
    base.entryLabel = zone === "inside" ? "In entry zone" : zone === "approach" ? `${pts(toEntry)} pts to entry` : `${pts(toEntry)} pts past entry`;
  }
  if (plan.stopLoss != null) base.pointsToStop = r2(long ? cmp - plan.stopLoss : plan.stopLoss - cmp);
  const t1 = plan.targets[0];
  if (t1 != null) base.pointsToTarget1 = r2(long ? t1 - cmp : cmp - t1);
  return base;
}

function mk(p: Partial<PlanEval> & { state: PlanState; label: string; tone: PlanTone; reason: string }, ctx: { cmp: number | null; distToEntry: number | null; distToStop: number | null; distToTarget: number | null }): PlanEval {
  return {
    approved: false,
    currentApproval: 0,
    approvalLabel: "—",
    exitConfidence: null,
    pnlPerUnit: null,
    pnlPercent: null,
    ...ctx,
    ...p,
  };
}

/** Live exit signals currently firing against a locked position direction. */
function exitSignals(live: LiveSignal | null, isLong: boolean, cmp: number | null): { triggered: number; total: number; reasons: string[] } {
  if (!live) return { triggered: 0, total: 0, reasons: [] };
  const i = live.indicators;
  const vwap = live.marketData.vwap;
  const items: { ok: boolean | null; label: string }[] = [
    { ok: i.supertrend != null ? i.supertrend.direction !== (isLong ? "bullish" : "bearish") : null, label: `Supertrend flipped ${isLong ? "bearish" : "bullish"}` },
    { ok: vwap != null && cmp != null ? (isLong ? cmp < vwap : cmp > vwap) : null, label: `price ${isLong ? "lost" : "reclaimed"} VWAP ₹${f(vwap)}` },
    { ok: i.rsi != null ? (isLong ? i.rsi < 45 : i.rsi > 55) : null, label: `RSI ${isLong ? "<45" : ">55"}` },
    { ok: i.macd != null ? (isLong ? i.macd.histogram < 0 : i.macd.histogram > 0) : null, label: `MACD turned ${isLong ? "negative" : "positive"}` },
    { ok: i.ema20 != null && i.ema50 != null ? (isLong ? i.ema20 < i.ema50 : i.ema20 > i.ema50) : null, label: "EMA structure failed" },
  ];
  const avail = items.filter((x) => x.ok != null);
  const fired = avail.filter((x) => x.ok === true);
  return { triggered: fired.length, total: avail.length, reasons: fired.map((x) => x.label) };
}

/**
 * Evaluate a LOCKED plan against live CMP + live indicators (+ optional active
 * position). Levels stay locked; this only decides the live action/approval and
 * the distances. ENTER approval needs win estimate ≥ MIN_WIN_ESTIMATE AND setup
 * strength ≥ MIN_SETUP_STRENGTH AND CMP in zone AND not invalidated.
 */
export function evaluatePlan(plan: TradePlanSnapshot, cmp: number | null, live: LiveSignal | null, position: PlanPosition | null, opts?: { continuationAtrMult?: number; dataStale?: boolean }): PlanEval {
  const long = plan.direction === "LONG";
  const continuationAtrMult = opts?.continuationAtrMult ?? 0.75;
  // Critical-data staleness blocks any fresh ENTER approval (§12/§18): a locked
  // trigger being touched is never enough when the live feed has gone stale.
  const freshBlocked = !!opts?.dataStale;
  const dist = (lvl: number | null) => (lvl != null && cmp != null ? r2(cmp - lvl) : null);
  const ctx = { cmp, distToEntry: dist(plan.entry), distToStop: dist(plan.stopLoss), distToTarget: dist(plan.targets[0] ?? null) };

  // ----- POSITION MANAGER: manage against the LOCKED stop/targets + live structure -----
  if (position) {
    const isLong = position.side === "LONG";
    const perUnit = cmp != null ? r2(isLong ? cmp - position.entryPrice : position.entryPrice - cmp) : null;
    const percent = cmp != null && position.entryPrice ? r2(((isLong ? cmp - position.entryPrice : position.entryPrice - cmp) / position.entryPrice) * 100) : null;
    const stop = position.stopLoss ?? plan.stopLoss;
    const target = position.target ?? plan.targets[0] ?? null;
    const pnl = { pnlPerUnit: perUnit, pnlPercent: percent };
    const hardStopHit = stop != null && cmp != null && (isLong ? cmp <= stop : cmp >= stop);
    const targetHit = target != null && cmp != null && (isLong ? cmp >= target : cmp <= target);
    const ex = exitSignals(live, isLong, cmp);
    const exitConfidence = hardStopHit ? 100 : ex.total > 0 ? Math.round((ex.triggered / ex.total) * 100) : 0;

    if (hardStopHit) {
      return mk({ state: "EXIT_NOW", label: "Exit now", approved: true, currentApproval: 100, approvalLabel: "Exit approved", tone: "bear", reason: `Price hit the locked stop-loss ₹${f(stop)} — exit to cap the loss.`, exitConfidence, ...pnl }, ctx);
    }
    if (exitConfidence >= MIN_EXIT_CONFIDENCE && ex.triggered > 0) {
      return mk({ state: "EXIT_NOW", label: "Exit now", approved: true, currentApproval: exitConfidence, approvalLabel: "Exit approved", tone: "bear", reason: `Exit: ${ex.reasons.join(", ")} (${exitConfidence}% exit confidence ≥ ${MIN_EXIT_CONFIDENCE}%).`, exitConfidence, ...pnl }, ctx);
    }
    if (targetHit) {
      return mk({ state: "BOOK_PARTIAL", label: "Book partial", approved: true, currentApproval: 100, approvalLabel: "Book approved", tone: "warn", reason: `Target ₹${f(target)} reached — book partial and trail the rest to ₹${f(plan.trailStop)}.`, exitConfidence, ...pnl }, ctx);
    }
    if (ex.triggered > 0) {
      return mk({ state: "REDUCE_RISK", label: "Reduce risk", approved: false, currentApproval: 0, approvalLabel: "No full-exit approval", tone: "warn", reason: `Warning signs (${exitConfidence}%): ${ex.reasons.join(", ")}. Tighten stop / reduce — a full exit needs ≥${MIN_EXIT_CONFIDENCE}%.`, exitConfidence, ...pnl }, ctx);
    }
    if (perUnit != null && perUnit > 0) {
      return mk({ state: "TRAIL_SL", label: "Trail stop", approved: false, currentApproval: 0, approvalLabel: "Holding (trail)", tone: "bull", reason: `In profit (${percent}%). Trail stop to ₹${f(plan.trailStop)}; hold while structure holds. Hard stop stays ₹${f(stop)}.`, exitConfidence, ...pnl }, ctx);
    }
    return mk({ state: "HOLD_CAUTION", label: "Hold with caution", approved: false, currentApproval: 0, approvalLabel: "Holding", tone: "neutral", reason: `Holding against locked stop ₹${f(stop)}. Exit only if it breaks or exit confidence ≥${MIN_EXIT_CONFIDENCE}%.`, exitConfidence, ...pnl }, ctx);
  }

  // ----- ENTRY SCANNER: CMP vs LOCKED entry/zone, gated by confidence -----
  if (plan.direction === "WAIT") {
    return mk({ state: "WAIT_SETUP", label: "Wait — no setup", tone: "neutral", approvalLabel: "No setup", reason: plan.reason }, ctx);
  }
  const invLevel = plan.invalidation ?? plan.stopLoss;
  if (cmp != null && invLevel != null && (long ? cmp <= invLevel : cmp >= invLevel)) {
    return mk({ state: "INVALIDATED", label: "Setup invalidated", tone: "warn", currentApproval: 0, approvalLabel: "Invalidated — plan void", reason: `CMP ₹${f(cmp)} broke the locked invalidation ₹${f(invLevel)}. The plan is void — Re-analyse for a fresh one.` }, ctx);
  }
  if (plan.entry != null && plan.safeLow != null && plan.safeHigh != null && cmp != null) {
    const reached = long ? cmp >= plan.entry : cmp <= plan.entry;
    const inZone = cmp >= plan.safeLow && cmp <= plan.safeHigh;
    const past = long ? cmp > plan.safeHigh : cmp < plan.safeLow;
    if (!reached) {
      return mk({ state: "WAIT_BREAKOUT", label: long ? "Wait for breakout" : "Wait for breakdown", tone: "info", approvalLabel: "Wait for breakout", reason: `Wait until price ${long ? "breaks above" : "breaks below"} the locked entry ₹${f(plan.entry)} (${f(Math.abs(ctx.distToEntry ?? 0))} pts away).` }, ctx);
    }
    if (past) {
      // CMP ran beyond the safe zone in the trade direction. Do NOT auto-reject:
      // evaluate live continuation vs pullback vs reversal (§11–15).
      const atr = plan.snapshot.atr;
      const edge = (long ? plan.safeHigh : plan.safeLow) as number;
      const beyond = long ? cmp - edge : edge - cmp; // points past the zone (>0)
      const beyondAtr = atr != null && atr > 0 ? beyond / atr : null;
      const rev = exitSignals(live, long, cmp); // live evidence AGAINST the trade
      const winOk = plan.winEstimate >= MIN_WIN_ESTIMATE;
      const strengthOk = plan.setupStrength >= MIN_SETUP_STRENGTH;
      const dirWord = long ? "above" : "below";

      // Reversal risk — the breakout is failing on live evidence.
      if (rev.triggered >= 2) {
        return mk({ state: "REVERSAL_RISK", label: "No entry — reversal risk", currentApproval: 0, approvalLabel: `No entry · reversal risk`, tone: "warn", reason: `Blocked: ${rev.reasons.slice(0, 2).join(" and ")}. Breakout failed ${dirWord} the zone — do not enter.` }, ctx);
      }
      // Overextended — trend intact but price ran too far past the zone.
      if (beyondAtr != null && beyondAtr > continuationAtrMult) {
        return mk({ state: "WAIT_PULLBACK", label: "Wait for pullback", currentApproval: 0, approvalLabel: `${cap(dirWord)} entry zone · wait for pullback`, tone: "warn", reason: `Price is ${beyondAtr.toFixed(2)} ATR ${dirWord} the safe entry range; remaining reward/risk is reduced. Wait for a pullback toward ₹${f(plan.entry)}.` }, ctx);
      }
      // Continuation valid — within the extension window, gates pass, no reversal.
      if (winOk && strengthOk && rev.triggered === 0) {
        if (freshBlocked) return mk({ state: "WAIT_CONFIRMATION", label: "No entry — data stale", currentApproval: 0, approvalLabel: "Blocked · data stale", tone: "warn", reason: "Continuation looks valid but live market data is stale — entry approval is blocked until a fresh quote/candle arrives." }, ctx);
        return mk({ state: "ENTER_NOW", label: `Enter ${plan.direction} — continuation valid`, approved: true, currentApproval: Math.min(plan.winEstimate, plan.setupStrength), approvalLabel: `${cap(dirWord)} entry zone · continuation valid`, tone: long ? "bull" : "bear", reason: `Continuation valid: price extended ${beyondAtr != null ? `${beyondAtr.toFixed(2)} ATR ` : ""}${dirWord} the zone but trend and indicators remain supportive with no reversal signal. Enter with stop ₹${f(plan.stopLoss)}.` }, ctx);
      }
      // Past the zone but continuation not confirmed — wait.
      const why = !winOk && !strengthOk ? `win ${plan.winEstimate}% & setup ${plan.setupStrength}% below thresholds` : !winOk ? `win ${plan.winEstimate}% < ${MIN_WIN_ESTIMATE}%` : rev.triggered > 0 ? rev.reasons[0] : `setup ${plan.setupStrength}% < ${MIN_SETUP_STRENGTH}%`;
      return mk({ state: "WAIT_CONFIRMATION", label: "Wait — continuation unconfirmed", currentApproval: 0, approvalLabel: `${cap(dirWord)} entry zone · wait`, tone: "warn", reason: `CMP ₹${f(cmp)} is ${dirWord} the zone but continuation isn't confirmed (${why}).` }, ctx);
    }
    if (inZone) {
      // Approval requires BOTH the backend win estimate AND the locked indicator
      // setup strength to clear their thresholds (and CMP in zone, not invalidated).
      const winOk = plan.winEstimate >= MIN_WIN_ESTIMATE;
      const strengthOk = plan.setupStrength >= MIN_SETUP_STRENGTH;
      if (winOk && strengthOk) {
        if (freshBlocked) {
          return mk({ state: "WAIT_CONFIRMATION", label: "No entry — data stale", currentApproval: 0, approvalLabel: "Blocked · data stale", tone: "warn", reason: `CMP is in the locked zone and the gates pass, but live market data is stale — entry approval is blocked until a fresh quote/candle arrives.` }, ctx);
        }
        return mk(
          {
            state: "ENTER_NOW",
            label: `Enter ${plan.direction} now`,
            approved: true,
            currentApproval: Math.min(plan.winEstimate, plan.setupStrength),
            approvalLabel: "Approved",
            tone: long ? "bull" : "bear",
            reason: `Approved: win estimate ${plan.winEstimate}% (≥${MIN_WIN_ESTIMATE}%), setup strength ${plan.setupStrength}% (≥${MIN_SETUP_STRENGTH}%), CMP in the locked zone. Enter with stop ₹${f(plan.stopLoss)}.`,
          },
          ctx,
        );
      }
      const why =
        !winOk && !strengthOk
          ? `win estimate ${plan.winEstimate}% (<${MIN_WIN_ESTIMATE}%) and setup strength ${plan.setupStrength}% (<${MIN_SETUP_STRENGTH}%)`
          : !winOk
            ? `win estimate ${plan.winEstimate}% is below ${MIN_WIN_ESTIMATE}%`
            : `only ${plan.setupStrength}% of indicators confirm (<${MIN_SETUP_STRENGTH}%)`;
      return mk({ state: "WAIT_CONFIRMATION", label: "No approval — wait", currentApproval: 0, approvalLabel: "No approval", tone: "warn", reason: `CMP is in the zone but ${why}. No entry approval — wait or Re-analyse.` }, ctx);
    }
  }
  return mk({ state: "WAIT_SETUP", label: "Wait", tone: "neutral", approvalLabel: "Wait", reason: plan.reason }, ctx);
}
