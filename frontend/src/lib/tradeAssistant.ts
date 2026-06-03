// Real-time AI Trade Assistant logic (Phase 3L/3M).
//
// Pure functions that translate a REAL `/api/analysis/live-signal` response into
// a single, actionable assistant view. The assistant is strictly context-aware:
//
//   • ENTRY SCANNER  — when NO active position exists. Only entry guidance
//     (WAIT_FOR_SETUP / WAIT_FOR_BREAKOUT / WAIT_FOR_PULLBACK / ENTER_NOW /
//     AVOID_TRADE). It NEVER says EXIT/BOOK/TRAIL because there is nothing to
//     exit.
//   • POSITION MANAGER — when a real Zerodha position OR an AI Virtual Trade
//     exists. Management guidance (HOLD / BOOK_PARTIAL / TRAIL_SL / EXIT_NOW /
//     REDUCE_RISK / ADD_MORE_ONLY_IF_SAFE), computed from the user's entry price
//     vs CMP plus live indicators.
//
// Every number comes from the backend signal / the user's own entry. Nothing is
// fabricated. Advisory only — this never places, modifies or cancels an order.

import type { LiveSignal } from "@/types/api";

export type AssistantMode = "ENTRY_SCANNER" | "POSITION_MANAGER";

export type AssistantState =
  // shared
  | "NO_SELECTION"
  | "DATA_STALE"
  | "BACKEND_OFFLINE"
  | "LOADING"
  // entry scanner
  | "WAIT_FOR_SETUP"
  | "WAIT_FOR_BREAKOUT"
  | "WAIT_FOR_PULLBACK"
  | "ENTER_NOW"
  | "AVOID_TRADE"
  // position manager
  | "HOLD"
  | "BOOK_PARTIAL"
  | "TRAIL_SL"
  | "EXIT_NOW"
  | "REDUCE_RISK"
  | "ADD_MORE_ONLY_IF_SAFE";

export type AssistantTone = "bull" | "bear" | "warn" | "info" | "neutral";
export type RiskLevel = "Low" | "Medium" | "High" | "Extreme";

export interface AssistantLevels {
  cmp: number | null;
  entry: number | null;
  safeZoneLow: number | null;
  safeZoneHigh: number | null;
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
  severity: "info" | "caution" | "urgent";
  sound: boolean;
  message: string;
}

export interface AssistantFactor {
  text: string;
  dir: "bullish" | "bearish" | "neutral" | "unavailable";
}

export interface PositionPnl {
  perUnit: number;
  total: number;
  percent: number;
}

export interface ActivePosition {
  source: "ai-virtual" | "zerodha";
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  stopLoss: number | null;
  target: number | null;
  id?: string;
}

export interface AssistantView {
  mode: AssistantMode;
  state: AssistantState;
  label: string;
  tone: AssistantTone;
  direction: "LONG" | "SHORT" | "NONE";
  action: string;
  reason: string;
  ltp: number | null;
  cmpStatus: string; // CMP vs entry, e.g. "₹62 below entry"
  confidencePercent: number | null;
  confidenceLabel: "low" | "medium" | "high" | null;
  dataQuality: LiveSignal["probability"]["dataQuality"] | null;
  riskLevel: RiskLevel | null;
  riskReward: string | null;
  riskFactor: string;
  factors: AssistantFactor[];
  levels: AssistantLevels;
  position: ActivePosition | null;
  pnl: PositionPnl | null;
  alert: AssistantAlert | null;
}

const STATE_LABEL: Record<AssistantState, string> = {
  NO_SELECTION: "No instrument",
  DATA_STALE: "Data stale",
  BACKEND_OFFLINE: "Backend offline",
  LOADING: "Reading…",
  WAIT_FOR_SETUP: "Wait — no setup",
  WAIT_FOR_BREAKOUT: "Wait for breakout",
  WAIT_FOR_PULLBACK: "Wait for pullback",
  ENTER_NOW: "Enter now",
  AVOID_TRADE: "Avoid",
  HOLD: "Hold",
  BOOK_PARTIAL: "Book partial",
  TRAIL_SL: "Trail stop",
  EXIT_NOW: "Exit now",
  REDUCE_RISK: "Reduce risk",
  ADD_MORE_ONLY_IF_SAFE: "Add only if safe",
};

function f(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

/** ATR-based trailing stop for the SIGNAL's preferred side (used by AI Rec). */
export function computeTrailStop(s: LiveSignal): number | null {
  const long = s.finalDecision.action === "LONG";
  const short = s.finalDecision.action === "SHORT";
  if (!long && !short) return null;
  return trailForSide(s, long ? "LONG" : "SHORT", (long ? s.longSetup : s.shortSetup).stopLoss);
}

/** ATR-based trailing stop for a given side, clamped to a floor (entry/SL). */
export function trailForSide(s: LiveSignal, side: "LONG" | "SHORT", floor: number | null): number | null {
  const atr = s.indicators.atr;
  const price = s.currentPrice;
  if (atr == null || atr <= 0) return floor;
  const t = side === "LONG" ? price - atr : price + atr;
  if (floor == null) return Math.round(t * 100) / 100;
  return Math.round((side === "LONG" ? Math.max(t, floor) : Math.min(t, floor)) * 100) / 100;
}

/** Top contributing indicators aligned with a direction (confidence factors). */
export function topFactors(s: LiveSignal, dir: "bullish" | "bearish", n = 4): AssistantFactor[] {
  const aligned = s.indicatorContributions
    .filter((c) => c.direction === dir)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((c) => ({ text: `${c.id} ${c.value}`, dir: c.direction }));
  if (aligned.length > 0) return aligned;
  return s.indicatorContributions
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((c) => ({ text: `${c.id} ${c.value}`, dir: c.direction }));
}

/** Full factor breakdown for the expandable Risk/Details view. */
export function factorBreakdown(s: LiveSignal): AssistantFactor[] {
  return s.indicatorContributions
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((c) => ({ text: `${c.id}: ${c.value} — ${c.detail}`, dir: c.direction }));
}

/** Risk level from real volatility (ATR%), trend strength, confidence + data. */
export function computeRiskLevel(s: LiveSignal): RiskLevel {
  const price = s.currentPrice;
  const atr = s.indicators.atr;
  const atrPct = atr != null && price ? (atr / price) * 100 : null;
  let score = 0;
  if (atrPct != null) {
    if (atrPct > 2) score += 3;
    else if (atrPct > 1) score += 2;
    else if (atrPct > 0.5) score += 1;
  } else {
    score += 1; // unknown volatility carries some risk
  }
  if (s.trend.strength === "weak") score += 1;
  if (s.probability.confidence === "low") score += 1;
  if (s.probability.dataQuality === "quote-only") score += 1;
  if (s.finalDecision.action === "AVOID") score += 2;
  return score >= 5 ? "Extreme" : score >= 3 ? "High" : score >= 1 ? "Medium" : "Low";
}

function safeZone(entry: number, t1: number, atr: number | null, long: boolean): { low: number; high: number } {
  const buffer = atr != null && atr > 0 ? Math.min(0.5 * atr, 0.25 * Math.abs(t1 - entry)) : Math.max(0.25 * Math.abs(t1 - entry), entry * 0.003);
  const b = buffer > 0 ? buffer : entry * 0.003;
  return long ? { low: entry, high: entry + b } : { low: entry - b, high: entry };
}

function cmpVsEntry(price: number, entry: number | null): string {
  if (entry == null) return "—";
  const d = Math.round((price - entry) * 100) / 100;
  if (d === 0) return "at entry";
  return `₹${f(Math.abs(d))} ${d > 0 ? "above" : "below"} entry`;
}

// ----------------------------- shared views --------------------------------

function emptyLevels(s?: LiveSignal): AssistantLevels {
  return {
    cmp: s?.currentPrice ?? null,
    entry: null,
    safeZoneLow: null,
    safeZoneHigh: null,
    stopLoss: null,
    target1: null,
    target2: null,
    target3: null,
    trail: null,
    invalidation: s?.finalDecision.invalidationLevel ?? null,
    support1: s?.levels.support1 ?? null,
    resistance1: s?.levels.resistance1 ?? null,
  };
}

export function noSelectionView(): AssistantView {
  return shell("ENTRY_SCANNER", "NO_SELECTION", "neutral", {
    action: "Pick or add an instrument to start scanning for entries.",
    reason: "The assistant follows the active scrip selected across the dashboard.",
  });
}

export function offlineView(message: string): AssistantView {
  return shell("ENTRY_SCANNER", "BACKEND_OFFLINE", "warn", {
    action: "Can't reach live data. Retrying…",
    reason: message,
    riskFactor: "Live monitoring paused until the backend responds.",
  });
}

export function loadingView(): AssistantView {
  return shell("ENTRY_SCANNER", "LOADING", "neutral", {
    action: "Fetching the live signal for the selected instrument…",
    reason: "Connecting to live Kite data via the backend.",
  });
}

function shell(mode: AssistantMode, state: AssistantState, tone: AssistantTone, extra: Partial<AssistantView>): AssistantView {
  return {
    mode,
    state,
    label: STATE_LABEL[state],
    tone,
    direction: "NONE",
    action: "",
    reason: "",
    ltp: null,
    cmpStatus: "—",
    confidencePercent: null,
    confidenceLabel: null,
    dataQuality: null,
    riskLevel: null,
    riskReward: null,
    riskFactor: "",
    factors: [],
    levels: emptyLevels(),
    position: null,
    pnl: null,
    alert: null,
    ...extra,
  };
}

/** Wrap any view as "stale" without losing its levels/LTP. */
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

// --------------------------- ENTRY SCANNER ---------------------------------

/** Entry-only guidance. Never returns an exit/hold/book state. */
export function deriveEntryScanner(s: LiveSignal): AssistantView {
  const action = s.finalDecision.action;
  const price = s.currentPrice;
  const riskLevel = computeRiskLevel(s);
  const common = {
    mode: "ENTRY_SCANNER" as const,
    ltp: price,
    confidencePercent: s.probability.estimatedWinPercent,
    confidenceLabel: s.probability.confidence,
    dataQuality: s.probability.dataQuality,
    riskLevel,
    reason: s.finalDecision.reason,
  };

  if (action === "AVOID") {
    return {
      ...shell("ENTRY_SCANNER", "AVOID_TRADE", "warn", common),
      cmpStatus: "no valid setup",
      riskFactor: "No clean edge — choppy / conflicting signals make this low-probability.",
      factors: topFactors(s, "bullish"),
      levels: { ...emptyLevels(s), cmp: price },
      alert: { severity: "caution", sound: false, message: "No clean edge — avoid trading now." },
    };
  }

  if (action === "WAIT") {
    const pref = s.preferredSetup;
    const watch = pref === "short" ? s.shortSetup : s.longSetup;
    const watchEntry = pref === "short" ? watch.entryBelow ?? null : watch.entryAbove ?? null;
    if (pref !== "none" && watchEntry != null) {
      const long = pref !== "short";
      const zone = safeZone(watchEntry, watch.target1, s.indicators.atr, long);
      const farPast = long ? price > zone.high : price < zone.low;
      const state: AssistantState = farPast ? "WAIT_FOR_PULLBACK" : "WAIT_FOR_BREAKOUT";
      return {
        ...shell("ENTRY_SCANNER", state, "info", common),
        direction: long ? "LONG" : "SHORT",
        cmpStatus: cmpVsEntry(price, watchEntry),
        action: farPast
          ? `Price ran ahead of ₹${f(watchEntry)} — don't chase; wait for a pullback into the zone.`
          : `Wait for a ${long ? "breakout above" : "breakdown below"} ₹${f(watchEntry)} (with volume).`,
        riskFactor: farPast ? "Chasing an extended move gives a poor risk-reward." : "Entering before the level triggers risks a false move.",
        factors: topFactors(s, long ? "bullish" : "bearish"),
        levels: {
          ...emptyLevels(s),
          cmp: price,
          entry: watchEntry,
          safeZoneLow: zone.low,
          safeZoneHigh: zone.high,
          stopLoss: watch.stopLoss,
          target1: watch.target1,
          target2: watch.target2,
          target3: watch.target3,
          trail: trailForSide(s, long ? "LONG" : "SHORT", watch.stopLoss),
        },
        riskReward: watch.riskReward,
      };
    }
    return {
      ...shell("ENTRY_SCANNER", "WAIT_FOR_SETUP", "neutral", common),
      cmpStatus: "no setup yet",
      action: `No clean setup yet — wait for a break of the no-trade zone (${s.levels.noTradeZone}).`,
      riskFactor: "Sideways / unclear trend: forcing a trade here is low-probability.",
      factors: topFactors(s, "bullish"),
      levels: { ...emptyLevels(s), cmp: price },
    };
  }

  // LONG / SHORT setup.
  const long = action === "LONG";
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = (long ? setup.entryAbove : setup.entryBelow) ?? null;
  const sl = setup.stopLoss;
  const zone = entry != null ? safeZone(entry, setup.target1, s.indicators.atr, long) : null;
  const levels: AssistantLevels = {
    cmp: price,
    entry,
    safeZoneLow: zone?.low ?? null,
    safeZoneHigh: zone?.high ?? null,
    stopLoss: sl,
    target1: setup.target1,
    target2: setup.target2,
    target3: setup.target3,
    trail: trailForSide(s, long ? "LONG" : "SHORT", sl),
    invalidation: s.finalDecision.invalidationLevel,
    support1: s.levels.support1,
    resistance1: s.levels.resistance1,
  };
  const factors = topFactors(s, long ? "bullish" : "bearish");
  const dir = long ? "LONG" : "SHORT";

  // Setup invalidated (CMP already beyond the stop) → avoid (no position to exit).
  if ((long && price <= sl) || (!long && price >= sl)) {
    return {
      ...shell("ENTRY_SCANNER", "AVOID_TRADE", "warn", common),
      direction: dir,
      cmpStatus: cmpVsEntry(price, entry),
      action: `Avoid this ${dir} — CMP is past the invalidation ₹${f(sl)}; the setup is broken.`,
      riskFactor: "Entering an already-invalidated setup is low-probability.",
      factors,
      levels,
      riskReward: setup.riskReward,
    };
  }

  const reached = entry == null ? true : long ? price >= entry : price <= entry;
  if (!reached && entry != null) {
    return {
      ...shell("ENTRY_SCANNER", "WAIT_FOR_BREAKOUT", "info", common),
      direction: dir,
      cmpStatus: cmpVsEntry(price, entry),
      action: `Wait for ${long ? "a breakout above" : "a breakdown below"} ₹${f(entry)} (1–2 candles + volume).`,
      riskFactor: "Pre-empting the breakout risks a fakeout against you.",
      factors,
      levels,
      riskReward: setup.riskReward,
    };
  }

  const farPast = entry != null && zone != null && (long ? price > zone.high : price < zone.low);
  if (farPast) {
    return {
      ...shell("ENTRY_SCANNER", "WAIT_FOR_PULLBACK", "warn", common),
      direction: dir,
      cmpStatus: cmpVsEntry(price, entry),
      action: `Don't chase — CMP is past the safe zone (₹${f(zone!.low)}–₹${f(zone!.high)}). Wait for a pullback.`,
      riskFactor: "Entering late, far from the trigger, gives a poor risk-reward.",
      factors,
      levels,
      riskReward: setup.riskReward,
    };
  }

  // Inside the safe entry zone → enter now.
  return {
    ...shell("ENTRY_SCANNER", "ENTER_NOW", long ? "bull" : "bear", common),
    direction: dir,
    cmpStatus: cmpVsEntry(price, entry),
    action: `${dir} trigger active in the safe zone — enter with SL ₹${f(sl)}.`,
    riskFactor: `Risk ≈ ${f(setup.riskPerUnit)} pts/unit to SL ₹${f(sl)}${s.indicators.atr != null ? ` · ATR ${f(s.indicators.atr)}` : ""}.`,
    factors,
    levels,
    riskReward: setup.riskReward,
    alert: { severity: "caution", sound: true, message: `${dir} entry active near ₹${f(entry ?? price)} · SL ₹${f(sl)} · T1 ₹${f(setup.target1)}.` },
  };
}

// --------------------------- POSITION MANAGER ------------------------------

function near(price: number, level: number, tol: number): boolean {
  return Math.abs(price - level) <= tol;
}

/** Management guidance for an ACTIVE position (real or AI virtual). */
export function derivePositionManager(s: LiveSignal, pos: ActivePosition): AssistantView {
  const price = s.currentPrice;
  const long = pos.side === "LONG";
  const entry = pos.entryPrice;
  const qty = pos.quantity;
  const perUnit = Math.round((long ? price - entry : entry - price) * 100) / 100;
  const pnl: PositionPnl = {
    perUnit,
    total: Math.round(perUnit * qty * 100) / 100,
    percent: entry ? Math.round((perUnit / entry) * 10000) / 100 : 0,
  };
  const atr = s.indicators.atr;
  const tol = atr != null && atr > 0 ? atr * 0.5 : price * 0.003;
  const sl = pos.stopLoss;
  const target = pos.target ?? (long ? s.longSetup.target1 : s.shortSetup.target1);
  const trail = trailForSide(s, pos.side, long ? Math.max(entry, sl ?? entry) : Math.min(entry, sl ?? entry));
  const riskLevel = computeRiskLevel(s);
  const dir = pos.side;

  const signalAgainst =
    (long && (s.finalDecision.action === "SHORT" || (s.trend.direction === "bearish" && s.trend.strength !== "weak"))) ||
    (!long && (s.finalDecision.action === "LONG" || (s.trend.direction === "bullish" && s.trend.strength !== "weak")));
  const signalAligned = (long && s.trend.direction === "bullish") || (!long && s.trend.direction === "bearish");
  const nearSupportOrRes = long ? near(price, s.levels.support1, tol) : near(price, s.levels.resistance1, tol);
  const slHit = sl != null && (long ? price <= sl : price >= sl);
  const targetHit = target != null && (long ? price >= target : price <= target);
  const nearSL = sl != null ? Math.abs(price - sl) <= Math.abs(entry - sl) * 0.25 : false;

  const levels: AssistantLevels = {
    cmp: price,
    entry,
    safeZoneLow: null,
    safeZoneHigh: null,
    stopLoss: sl ?? (long ? s.longSetup.stopLoss : s.shortSetup.stopLoss),
    target1: target,
    target2: long ? s.longSetup.target2 : s.shortSetup.target2,
    target3: long ? s.longSetup.target3 : s.shortSetup.target3,
    trail,
    invalidation: s.finalDecision.invalidationLevel,
    support1: s.levels.support1,
    resistance1: s.levels.resistance1,
  };
  const factors = topFactors(s, long ? "bullish" : "bearish");
  const common = {
    mode: "POSITION_MANAGER" as const,
    direction: dir as "LONG" | "SHORT",
    ltp: price,
    cmpStatus: cmpVsEntry(price, entry),
    confidencePercent: s.probability.estimatedWinPercent,
    confidenceLabel: s.probability.confidence,
    dataQuality: s.probability.dataQuality,
    riskLevel,
    riskReward: long ? s.longSetup.riskReward : s.shortSetup.riskReward,
    factors,
    levels,
    position: pos,
    pnl,
  };
  const pnlText = `Live P/L ${pnl.total >= 0 ? "+" : ""}₹${f(pnl.total)} (${pnl.perUnit >= 0 ? "+" : ""}${f(pnl.perUnit)}/unit, ${pnl.percent >= 0 ? "+" : ""}${f(pnl.percent)}%).`;

  // 1) Hard stop breached.
  if (slHit) {
    return {
      ...shell("POSITION_MANAGER", "EXIT_NOW", "bear", common),
      action: `Stop-loss ₹${f(sl)} breached — exit ${dir} now to cap the loss.`,
      reason: `${pnlText} Holding past your stop turns a planned loss into a bigger one.`,
      riskFactor: pnlText,
      alert: { severity: "urgent", sound: true, message: `${dir}: stop-loss ₹${f(sl)} hit — exit. ${pnlText}` },
    };
  }

  // 2) Trend flipped against you while not in profit.
  if (signalAgainst && perUnit <= 0) {
    return {
      ...shell("POSITION_MANAGER", "EXIT_NOW", "bear", common),
      action: `Trend turned against your ${dir} and you're not in profit — exit / cut the loss.`,
      reason: `${pnlText} Signal now favours the opposite side (${s.trend.direction}, ${s.trend.strength}).`,
      riskFactor: pnlText,
      alert: { severity: "urgent", sound: true, message: `${dir}: trend flipped against you — consider exiting. ${pnlText}` },
    };
  }

  // 3) Target reached.
  if (targetHit) {
    return {
      ...shell("POSITION_MANAGER", "BOOK_PARTIAL", "warn", common),
      action: `Target ₹${f(target)} hit — book partial and trail SL to ₹${f(trail)}.`,
      reason: `${pnlText} Lock in profit; let a runner work with a trailed stop.`,
      riskFactor: pnlText,
      alert: { severity: "caution", sound: true, message: `${dir}: target ₹${f(target)} hit — book partial, trail SL. ${pnlText}` },
    };
  }

  // 4) In profit, strongly aligned, near support/resistance → can add only if safe.
  if (perUnit > 0 && signalAligned && s.trend.strength !== "weak" && riskLevel !== "Extreme" && nearSupportOrRes) {
    return {
      ...shell("POSITION_MANAGER", "ADD_MORE_ONLY_IF_SAFE", "info", common),
      action: `Trend supports adding only if safe — near ${long ? `support ₹${f(s.levels.support1)}` : `resistance ₹${f(s.levels.resistance1)}`}; risk the SAME total, keep SL tight.`,
      reason: `${pnlText} Only pyramid into a winner with strong trend; never average a loser.`,
      riskFactor: `${pnlText} Adding increases exposure — keep total risk ≤ your per-trade limit.`,
    };
  }

  // 5) In profit → trail.
  if (perUnit > 0) {
    return {
      ...shell("POSITION_MANAGER", "TRAIL_SL", "bull", common),
      action: `In profit — trail SL to ₹${f(trail)} and ride toward ₹${f(target)}.`,
      reason: `${pnlText} Protect the open profit; don't give it all back.`,
      riskFactor: pnlText,
      alert: { severity: "caution", sound: false, message: `${dir}: in profit — trail SL to ₹${f(trail)}. ${pnlText}` },
    };
  }

  // 6) In loss but stop not hit — reduce risk if weak/near SL, else hold.
  if (signalAgainst || nearSL || riskLevel === "Extreme") {
    return {
      ...shell("POSITION_MANAGER", "REDUCE_RISK", "warn", common),
      action: `Loss building and momentum is weak — reduce size / tighten SL${sl != null ? ` (₹${f(sl)})` : ""}. Don't average down.`,
      reason: `${pnlText} ${nearSL ? "Price is close to your stop." : "Conditions favour cutting risk, not adding."}`,
      riskFactor: pnlText,
      alert: { severity: "caution", sound: true, message: `${dir}: reduce risk — loss building. ${pnlText}` },
    };
  }

  return {
    ...shell("POSITION_MANAGER", "HOLD", long ? "bull" : "bear", common),
    action: `Hold — setup still intact. Invalidation ₹${f(s.finalDecision.invalidationLevel)}; exit if it breaks.`,
    reason: `${pnlText} The position thesis hasn't been invalidated yet.`,
    riskFactor: pnlText,
  };
}

// --------------------- real Zerodha position matching ----------------------

interface RawPositionsResponse {
  source?: string;
  positions?: { net?: unknown[]; day?: unknown[] };
}

/**
 * Best-effort match of a Zerodha live position to the selected instrument.
 * Returns null (no fabrication) when unavailable or unmatched. Equity matches
 * reliably; F&O may differ by symbol — caller should offer an AI Virtual Trade.
 */
export function parseZerodhaPosition(resp: unknown, instrumentKey: string): ActivePosition | null {
  const r = resp as RawPositionsResponse;
  if (!r || r.source !== "zerodha" || !r.positions) return null;
  const rows = [...(r.positions.net ?? []), ...(r.positions.day ?? [])];
  for (const raw of rows) {
    const p = raw as Record<string, unknown>;
    const exch = typeof p.exchange === "string" ? p.exchange : "";
    const sym = typeof p.tradingsymbol === "string" ? p.tradingsymbol : "";
    const qty = typeof p.quantity === "number" ? p.quantity : 0;
    if (!exch || !sym || qty === 0) continue;
    if (`${exch}:${sym}` !== instrumentKey) continue;
    const avg = typeof p.average_price === "number" ? p.average_price : 0;
    if (avg <= 0) continue;
    return {
      source: "zerodha",
      side: qty > 0 ? "LONG" : "SHORT",
      entryPrice: avg,
      quantity: Math.abs(qty),
      stopLoss: null,
      target: null,
    };
  }
  return null;
}
