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
export function evaluatePlan(plan: TradePlanSnapshot, cmp: number | null, live: LiveSignal | null, position: PlanPosition | null): PlanEval {
  const long = plan.direction === "LONG";
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
      return mk({ state: "WAIT_PULLBACK", label: "Do not chase", tone: "warn", approvalLabel: "Do not chase", reason: `CMP ₹${f(cmp)} is past the safe zone (₹${f(plan.safeLow)}–₹${f(plan.safeHigh)}). Don't chase — wait for a pullback toward ₹${f(plan.entry)}.` }, ctx);
    }
    if (inZone) {
      // Approval requires BOTH the backend win estimate AND the locked indicator
      // setup strength to clear their thresholds (and CMP in zone, not invalidated).
      const winOk = plan.winEstimate >= MIN_WIN_ESTIMATE;
      const strengthOk = plan.setupStrength >= MIN_SETUP_STRENGTH;
      if (winOk && strengthOk) {
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
