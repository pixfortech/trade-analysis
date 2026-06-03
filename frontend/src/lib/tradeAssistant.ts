// Real-time AI Trade Assistant logic (Phase 3L).
//
// Pure functions that translate a REAL `/api/analysis/live-signal` response into
// a single, actionable assistant state (ENTER NOW / WAIT / HOLD / BOOK PARTIAL /
// TRAIL SL / EXIT NOW / AVOID …). Every number used here comes from the backend
// signal — nothing is fabricated. Advisory only: this never places, modifies or
// cancels any order.

import type { LiveSignal } from "@/types/api";

export type AssistantState =
  | "NO_SELECTION"
  | "WAIT_FOR_SETUP"
  | "WAIT_FOR_BREAKOUT"
  | "ENTER_NOW"
  | "HOLD"
  | "BOOK_PARTIAL"
  | "TRAIL_SL"
  | "EXIT_NOW"
  | "AVOID_TRADE"
  | "DATA_STALE"
  | "BACKEND_OFFLINE";

export type AssistantTone = "bull" | "bear" | "warn" | "info" | "neutral";

export interface AssistantLevels {
  entry: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  trail: number | null;
  invalidation: number | null;
  support1: number | null;
  resistance1: number | null;
}

export interface AssistantAlert {
  /** Notification severity. */
  severity: "info" | "caution" | "urgent";
  /** Whether to also beep / vibrate (when sound is enabled). */
  sound: boolean;
  /** Short one-line body. */
  message: string;
}

export interface AssistantFactor {
  text: string;
  dir: "bullish" | "bearish" | "neutral" | "unavailable";
}

export interface AssistantView {
  state: AssistantState;
  label: string;
  tone: AssistantTone;
  direction: "LONG" | "SHORT" | "NONE";
  /** Short imperative action line. */
  action: string;
  /** Why — plain language reason. */
  reason: string;
  ltp: number | null;
  confidencePercent: number | null;
  confidenceLabel: "low" | "medium" | "high" | null;
  dataQuality: LiveSignal["probability"]["dataQuality"] | null;
  /** One-line risk factor (what hurts you here). */
  riskFactor: string;
  factors: AssistantFactor[];
  levels: AssistantLevels;
  /** Non-null only for alert-worthy states (ENTER/EXIT/BOOK PARTIAL/AVOID). */
  alert: AssistantAlert | null;
}

const STATE_LABEL: Record<AssistantState, string> = {
  NO_SELECTION: "No instrument",
  WAIT_FOR_SETUP: "Wait — no setup",
  WAIT_FOR_BREAKOUT: "Wait for breakout",
  ENTER_NOW: "Enter now",
  HOLD: "Hold",
  BOOK_PARTIAL: "Book partial",
  TRAIL_SL: "Trail stop",
  EXIT_NOW: "Exit now",
  AVOID_TRADE: "Avoid",
  DATA_STALE: "Data stale",
  BACKEND_OFFLINE: "Backend offline",
};

/** ATR-based trailing stop, clamped to never sit beyond the protective stop. */
export function computeTrailStop(s: LiveSignal): number | null {
  const long = s.finalDecision.action === "LONG";
  const short = s.finalDecision.action === "SHORT";
  if (!long && !short) return null;
  const setup = long ? s.longSetup : s.shortSetup;
  const atr = s.indicators.atr;
  const price = s.currentPrice;
  if (atr != null && atr > 0) {
    const t = long ? price - atr : price + atr;
    return long ? Math.max(t, setup.stopLoss) : Math.min(t, setup.stopLoss);
  }
  return setup.stopLoss; // fall back to the structural stop
}

/** Top contributing indicators aligned with a direction (for the confidence "factors"). */
export function topFactors(s: LiveSignal, dir: "bullish" | "bearish", n = 3): AssistantFactor[] {
  const aligned = s.indicatorContributions
    .filter((c) => c.direction === dir)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((c) => ({ text: `${c.id} ${c.value}`, dir: c.direction }));
  if (aligned.length > 0) return aligned;
  // Fall back to the strongest contributors regardless of direction.
  return s.indicatorContributions
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((c) => ({ text: `${c.id} ${c.value}`, dir: c.direction }));
}

function levelsOf(s: LiveSignal, tradeable: boolean): AssistantLevels {
  const long = s.finalDecision.action === "LONG";
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = tradeable ? (long ? setup.entryAbove ?? null : setup.entryBelow ?? null) : null;
  return {
    entry,
    stopLoss: tradeable ? setup.stopLoss : null,
    target1: tradeable ? setup.target1 : null,
    target2: tradeable ? setup.target2 : null,
    target3: tradeable ? setup.target3 : null,
    trail: tradeable ? computeTrailStop(s) : null,
    invalidation: s.finalDecision.invalidationLevel,
    support1: s.levels.support1,
    resistance1: s.levels.resistance1,
  };
}

function base(s: LiveSignal, partial: Partial<AssistantView>): AssistantView {
  return {
    state: "WAIT_FOR_SETUP",
    label: STATE_LABEL.WAIT_FOR_SETUP,
    tone: "neutral",
    direction: "NONE",
    action: "",
    reason: s.finalDecision.reason,
    ltp: s.currentPrice,
    confidencePercent: s.probability.estimatedWinPercent,
    confidenceLabel: s.probability.confidence,
    dataQuality: s.probability.dataQuality,
    riskFactor: "",
    factors: [],
    levels: levelsOf(s, false),
    alert: null,
    ...partial,
  };
}

/** No instrument selected. */
export function noSelectionView(): AssistantView {
  return {
    state: "NO_SELECTION",
    label: STATE_LABEL.NO_SELECTION,
    tone: "neutral",
    direction: "NONE",
    action: "Pick an instrument in Live Market Signal to start monitoring.",
    reason: "The assistant follows the instrument selected across the dashboard.",
    ltp: null,
    confidencePercent: null,
    confidenceLabel: null,
    dataQuality: null,
    riskFactor: "",
    factors: [],
    levels: {
      entry: null, stopLoss: null, target1: null, target2: null, target3: null,
      trail: null, invalidation: null, support1: null, resistance1: null,
    },
    alert: null,
  };
}

/** Backend unreachable (no data at all). */
export function offlineView(message: string): AssistantView {
  return {
    state: "BACKEND_OFFLINE",
    label: STATE_LABEL.BACKEND_OFFLINE,
    tone: "warn",
    direction: "NONE",
    action: "Can't reach live data. Retrying…",
    reason: message,
    ltp: null,
    confidencePercent: null,
    confidenceLabel: null,
    dataQuality: null,
    riskFactor: "Live monitoring paused until the backend responds.",
    factors: [],
    levels: {
      entry: null, stopLoss: null, target1: null, target2: null, target3: null,
      trail: null, invalidation: null, support1: null, resistance1: null,
    },
    alert: null,
  };
}

function f(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

/**
 * Derive the live assistant view from a signal. Frame: ENTER/WAIT/AVOID are
 * entry guidance; HOLD/BOOK PARTIAL/TRAIL/EXIT are "if you're in this trade".
 */
export function deriveAssistant(s: LiveSignal): AssistantView {
  const action = s.finalDecision.action;
  const long = action === "LONG";
  const short = action === "SHORT";
  const tradeable = long || short;
  const price = s.currentPrice;
  const riskNote = (setupRisk: number, sl: number) =>
    `Risk ≈ ${f(setupRisk)} pts/unit to SL ${f(sl)}${s.indicators.atr != null ? ` · ATR ${f(s.indicators.atr)}` : ""}.`;

  // AVOID — explicit no-trade.
  if (action === "AVOID") {
    return base(s, {
      state: "AVOID_TRADE",
      label: STATE_LABEL.AVOID_TRADE,
      tone: "warn",
      action: "Avoid trading this now — stay flat.",
      riskFactor: "No clean edge: choppy / conflicting signals make this low-probability.",
      factors: topFactors(s, "bullish"),
      alert: { severity: "caution", sound: false, message: "No clean edge — avoid trading now." },
    });
  }

  // WAIT — either no setup, or a setup we're waiting to trigger.
  if (action === "WAIT") {
    const pref = s.preferredSetup;
    const watch = pref === "short" ? s.shortSetup : s.longSetup;
    const watchEntry = pref === "short" ? watch.entryBelow : watch.entryAbove;
    if (pref !== "none" && watchEntry != null) {
      const dir = pref === "short" ? "SHORT" : "LONG";
      return base(s, {
        state: "WAIT_FOR_BREAKOUT",
        label: STATE_LABEL.WAIT_FOR_BREAKOUT,
        tone: "info",
        direction: dir,
        action: `Wait for a ${pref === "short" ? "breakdown below" : "breakout above"} ₹${f(watchEntry)} (with volume).`,
        riskFactor: "Entering before the level triggers risks a false move.",
        factors: topFactors(s, pref === "short" ? "bearish" : "bullish"),
        levels: { ...levelsOf(s, false), entry: watchEntry, stopLoss: watch.stopLoss, target1: watch.target1, target2: watch.target2, target3: watch.target3 },
      });
    }
    return base(s, {
      state: "WAIT_FOR_SETUP",
      label: STATE_LABEL.WAIT_FOR_SETUP,
      tone: "neutral",
      action: `No clean setup yet — wait for a break of the no-trade zone (${s.levels.noTradeZone}).`,
      riskFactor: "Sideways / unclear trend: forcing a trade here is low-probability.",
      factors: topFactors(s, "bullish"),
    });
  }

  // Tradeable (LONG / SHORT). Compare live price to the setup levels.
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = long ? setup.entryAbove ?? null : setup.entryBelow ?? null;
  const sl = setup.stopLoss;
  const t1 = setup.target1;
  const t2 = setup.target2;
  const trail = computeTrailStop(s);
  const dir: "LONG" | "SHORT" = long ? "LONG" : "SHORT";
  const tradeLevels = levelsOf(s, true);
  const factors = topFactors(s, long ? "bullish" : "bearish");

  // Stop-loss breached → exit now.
  const slHit = long ? price <= sl : price >= sl;
  if (slHit) {
    return base(s, {
      state: "EXIT_NOW",
      label: STATE_LABEL.EXIT_NOW,
      tone: "bear",
      direction: dir,
      action: `Stop-loss ₹${f(sl)} breached — exit to limit the loss.`,
      riskFactor: "Setup is invalidated; holding past the stop turns a planned loss into a bigger one.",
      factors,
      levels: tradeLevels,
      alert: { severity: "urgent", sound: true, message: `Stop-loss ₹${f(sl)} hit — exit ${dir} to limit loss.` },
    });
  }

  // Not yet at the entry trigger → wait for breakout.
  const reached = entry == null ? true : long ? price >= entry : price <= entry;
  if (!reached && entry != null) {
    return base(s, {
      state: "WAIT_FOR_BREAKOUT",
      label: STATE_LABEL.WAIT_FOR_BREAKOUT,
      tone: "info",
      direction: dir,
      action: `Wait for ${long ? "a breakout above" : "a breakdown below"} ₹${f(entry)} (1–2 candles + volume).`,
      riskFactor: "Pre-empting the breakout risks a fakeout against you.",
      factors,
      levels: tradeLevels,
    });
  }

  // Past entry — figure out where price is relative to the targets.
  const t1Hit = long ? price >= t1 : price <= t1;
  const t2Hit = long ? price >= t2 : price <= t2;

  if (t2Hit) {
    return base(s, {
      state: "TRAIL_SL",
      label: STATE_LABEL.TRAIL_SL,
      tone: "info",
      direction: dir,
      action: `Target 2 ₹${f(t2)} done — trail SL to ₹${f(trail)} and let the runner work.`,
      riskFactor: "Most of the move is captured; protect profit, don't give it all back.",
      factors,
      levels: tradeLevels,
    });
  }

  if (t1Hit) {
    return base(s, {
      state: "BOOK_PARTIAL",
      label: STATE_LABEL.BOOK_PARTIAL,
      tone: "warn",
      direction: dir,
      action: `Target 1 ₹${f(t1)} hit — book partial and trail SL to ₹${f(trail)}.`,
      riskFactor: riskNote(setup.riskPerUnit, sl),
      factors,
      levels: tradeLevels,
      alert: { severity: "caution", sound: true, message: `Target 1 ₹${f(t1)} hit — book partial, trail SL.` },
    });
  }

  // Between entry and Target 1. Just-triggered → ENTER NOW; deeper in → HOLD.
  const ref = entry ?? price;
  const span = Math.abs(t1 - ref) || 1;
  const moved = Math.abs(price - ref);
  const frac = moved / span;
  if (frac <= 0.25) {
    return base(s, {
      state: "ENTER_NOW",
      label: STATE_LABEL.ENTER_NOW,
      tone: long ? "bull" : "bear",
      direction: dir,
      action: `${dir} trigger active near ₹${f(entry ?? price)} — enter with SL ₹${f(sl)}.`,
      riskFactor: riskNote(setup.riskPerUnit, sl),
      factors,
      levels: tradeLevels,
      alert: { severity: "caution", sound: true, message: `${dir} entry active near ₹${f(entry ?? price)} · SL ₹${f(sl)} · T1 ₹${f(t1)}.` },
    });
  }

  return base(s, {
    state: "HOLD",
    label: STATE_LABEL.HOLD,
    tone: long ? "bull" : "bear",
    direction: dir,
    action: `In the move — hold toward Target 1 ₹${f(t1)}; trail SL to ₹${f(trail)}.`,
    riskFactor: riskNote(setup.riskPerUnit, sl),
    factors,
    levels: tradeLevels,
  });
}

/** Wrap a derived view as "stale" without losing its levels/LTP. */
export function staleView(view: AssistantView): AssistantView {
  return {
    ...view,
    state: "DATA_STALE",
    label: STATE_LABEL.DATA_STALE,
    tone: "warn",
    action: "Live data looks stale — the backend is slow or updates are paused.",
    alert: null,
  };
}
