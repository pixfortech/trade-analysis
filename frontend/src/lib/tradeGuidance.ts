// Precise Enter → Hold → Exit guidance derived from the REAL live-signal
// indicators (Phase 3Q). Turns the raw indicators into actionable rules:
//   1) ENTRY  — the exact trigger level + a checklist of indicator confirmations
//               that must be green before entering (don't enter on a hunch).
//   2) HOLD   — the conditions that must stay true to keep the position, plus
//               where to trail the stop right now.
//   3) EXIT   — the hard stop (the loss line), partial-booking level, targets,
//               and the precise indicator signals that say "get out".
//
// Every number comes from the backend signal. Advisory only — disciplined risk
// control, NOT a guarantee against losses.

import type { LiveSignal } from "@/types/api";

export type GuidanceSide = "LONG" | "SHORT" | "WAIT";
export type EntryStatus = "ENTER_NOW" | "WAIT_BREAKOUT" | "WAIT_PULLBACK" | "WAIT_SETUP" | "AVOID";

export interface GuidanceCheck {
  label: string;
  /** true = confirms, false = against, null = data unavailable. */
  met: boolean | null;
}

export interface TradeGuidance {
  side: GuidanceSide;
  entry: {
    status: EntryStatus;
    label: string;
    trigger: number | null;
    safeLow: number | null;
    safeHigh: number | null;
    checks: GuidanceCheck[];
    confirmed: number;
    total: number;
    note: string;
  };
  hold: { conditions: string[]; trail: number | null; note: string };
  exit: { hardStop: number | null; invalidation: number | null; bookPartial: number | null; targets: number[]; signals: string[]; note: string };
  riskReward: string | null;
  disclaimer: string;
}

function f(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

export function buildTradeGuidance(s: LiveSignal): TradeGuidance {
  const action = s.finalDecision.action;
  const side: GuidanceSide =
    action === "LONG" ? "LONG" : action === "SHORT" ? "SHORT" : s.preferredSetup === "long" ? "LONG" : s.preferredSetup === "short" ? "SHORT" : "WAIT";

  if (side === "WAIT") {
    const avoid = action === "AVOID";
    return {
      side: "WAIT",
      entry: {
        status: avoid ? "AVOID" : "WAIT_SETUP",
        label: avoid ? "Avoid — no edge" : "Wait — no setup",
        trigger: null,
        safeLow: null,
        safeHigh: null,
        checks: directionChecks(s, "LONG"), // show the long-side confirmation status as context
        confirmed: 0,
        total: 0,
        note: avoid
          ? "Signals are conflicting / choppy. Staying flat IS the trade — forcing one here is how losses start."
          : `No clean setup yet. Only go long on a confirmed break above resistance ₹${f(s.levels.resistance1)}, or short below support ₹${f(s.levels.support1)} — both with volume. Until then, no entry.`,
      },
      hold: { conditions: [], trail: null, note: "No position to manage yet." },
      exit: { hardStop: null, invalidation: s.finalDecision.invalidationLevel, bookPartial: null, targets: [], signals: [], note: "Nothing to exit." },
      riskReward: null,
      disclaimer: s.disclaimer,
    };
  }

  const long = side === "LONG";
  const setup = long ? s.longSetup : s.shortSetup;
  const price = s.currentPrice;
  const atr = s.indicators.atr;
  const trigger = (long ? setup.entryAbove : setup.entryBelow) ?? null;

  // Safe entry band: from the trigger to a small buffer in the trade direction.
  const buffer = atr != null && atr > 0 ? Math.min(0.5 * atr, 0.25 * Math.abs(setup.target1 - (trigger ?? price))) : Math.max(0.25 * Math.abs(setup.target1 - (trigger ?? price)), price * 0.003);
  const b = buffer > 0 ? buffer : price * 0.003;
  const safeLow = trigger == null ? null : long ? trigger : trigger - b;
  const safeHigh = trigger == null ? null : long ? trigger + b : trigger;

  const checks = directionChecks(s, side);
  const confirmed = checks.filter((c) => c.met === true).length;
  const total = checks.filter((c) => c.met != null).length;
  const strongConfirm = total === 0 ? true : confirmed >= Math.ceil(total * 0.6);

  // Entry status from price vs trigger + confirmation strength.
  let status: EntryStatus;
  let label: string;
  let note: string;
  const reached = trigger == null ? true : long ? price >= trigger : price <= trigger;
  const past = trigger != null && (long ? price > safeHigh! : price < safeLow!);
  if (action === "AVOID") {
    status = "AVOID";
    label = "Avoid this setup";
    note = "CMP is past the invalidation — the setup is broken. Don't enter.";
  } else if (!reached) {
    status = "WAIT_BREAKOUT";
    label = long ? "Wait for breakout" : "Wait for breakdown";
    note = `Enter only when price ${long ? "breaks and holds above" : "breaks and holds below"} ₹${f(trigger)} for 1–2 candles WITH the checks below green. Pre-empting the break is a common loss.`;
  } else if (past) {
    status = "WAIT_PULLBACK";
    label = "Don't chase — wait for pullback";
    note = `Price ran past the safe zone (₹${f(safeLow)}–₹${f(safeHigh)}). Chasing here gives a poor risk-reward. Wait for a pullback toward ₹${f(trigger)}.`;
  } else if (!strongConfirm) {
    status = "WAIT_SETUP";
    label = "In zone — wait for confirmation";
    note = `Price is in the entry zone but only ${confirmed}/${total} indicators confirm. Wait until most checks below are green before risking capital.`;
  } else {
    status = "ENTER_NOW";
    label = "Enter now (confirmed)";
    note = `Price is in the safe zone (₹${f(safeLow)}–₹${f(safeHigh)}) and ${confirmed}/${total} indicators confirm. Enter ${side} and immediately place the stop at ₹${f(setup.stopLoss)} — risk ≈ ${f(setup.riskPerUnit)} pts/unit.`;
  }

  // Trail level now: ATR-based, clamped so it never sits worse than the stop.
  const trail = atr != null && atr > 0 ? round2(long ? Math.max(price - atr, setup.stopLoss) : Math.min(price + atr, setup.stopLoss)) : setup.stopLoss;
  const vwap = s.marketData.vwap;
  const st = s.indicators.supertrend;

  const holdConditions = [
    vwap != null ? `Price stays ${long ? "above" : "below"} VWAP ₹${f(vwap)} (the intraday value line)` : null,
    st != null ? `Supertrend stays ${long ? "bullish" : "bearish"} (₹${f(st.value)})` : null,
    `Each pullback makes a ${long ? "higher low (no lower low)" : "lower high (no higher high)"}`,
    s.indicators.rsi != null ? `RSI stays ${long ? "above ~45" : "below ~55"}` : null,
  ].filter((x): x is string => x != null);

  const exitSignals = [
    `Price closes ${long ? "below" : "above"} the stop-loss ₹${f(setup.stopLoss)} (hard exit)`,
    st != null ? `Supertrend flips to ${long ? "bearish" : "bullish"}` : null,
    vwap != null ? `Price decisively loses VWAP ₹${f(vwap)}` : null,
    s.indicators.rsi != null ? `RSI ${long ? "drops below 45" : "rises above 55"}` : null,
    s.indicators.macd != null ? `MACD histogram turns ${long ? "negative" : "positive"}` : null,
  ].filter((x): x is string => x != null);

  return {
    side,
    entry: { status, label, trigger, safeLow, safeHigh, checks, confirmed, total, note },
    hold: {
      conditions: holdConditions,
      trail,
      note: `As price moves your way, ratchet the stop up to ₹${f(trail)} (and behind each new ${long ? "higher low" : "lower high"}). Never widen the stop to “give it room” — that is the #1 cause of big losses.`,
    },
    exit: {
      hardStop: setup.stopLoss,
      invalidation: s.finalDecision.invalidationLevel,
      bookPartial: setup.target1,
      targets: [setup.target1, setup.target2, setup.target3],
      signals: exitSignals,
      note: `Book part at Target 1 ₹${f(setup.target1)} and trail the rest. Exit ALL immediately if any red signal triggers — capping the loss at the stop is what protects the account.`,
    },
    riskReward: setup.riskReward,
    disclaimer: s.disclaimer,
  };
}

/** Indicator confirmation checklist for a side, with live met/against status. */
function directionChecks(s: LiveSignal, side: "LONG" | "SHORT"): GuidanceCheck[] {
  const long = side === "LONG";
  const i = s.indicators;
  const vwap = s.marketData.vwap;
  const price = s.currentPrice;
  const cmp = (a: number, b: number) => (long ? a > b : a < b);
  return [
    { label: vwap != null ? `Price ${long ? "above" : "below"} VWAP ₹${f(vwap)}` : "Price vs VWAP", met: vwap != null ? cmp(price, vwap) : null },
    { label: `EMA20 ${long ? "above" : "below"} EMA50 (${long ? "up" : "down"}trend)`, met: i.ema20 != null && i.ema50 != null ? cmp(i.ema20, i.ema50) : null },
    { label: `RSI ${long ? "above 50" : "below 50"}${i.rsi != null ? ` — now ${f(i.rsi)}` : ""}`, met: i.rsi != null ? (long ? i.rsi > 50 : i.rsi < 50) : null },
    { label: `MACD histogram ${long ? "positive" : "negative"}`, met: i.macd != null ? (long ? i.macd.histogram > 0 : i.macd.histogram < 0) : null },
    { label: `Supertrend ${long ? "bullish" : "bearish"}${i.supertrend != null ? ` (₹${f(i.supertrend.value)})` : ""}`, met: i.supertrend != null ? i.supertrend.direction === (long ? "bullish" : "bearish") : null },
    { label: `ADX above 20 (trend strength)${i.adx != null ? ` — now ${f(i.adx.adx)}` : ""}`, met: i.adx != null ? i.adx.adx > 20 : null },
    { label: "Volume confirms the move", met: i.volumeConfirmed },
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
