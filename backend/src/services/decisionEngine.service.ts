// =====================================================================
// REAL-TIME DECISION LOOP (READ-ONLY, advisory) — the central orchestrator.
// One call = one tick of the loop for one instrument. It:
//   1) ingests a fresh signal + candles in a single fetch,
//   2) runs the data-quality gate (never presents stale as fresh),
//   3) reuses the exact intelligence fusion (technical+VIX+news+breadth),
//   4) classifies the market regime,
//   5) runs specialised setup detectors (Connors RSI / trend / breakout / RF+HACOLT),
//   6) computes Chandelier trailing stops + (if a position is supplied) the exit engine,
//   7) assembles supporting / blocking / CONFLICT factors and separate scores,
//   8) proposes an action + state, applies anti-flicker hysteresis via the
//      stateful store, records an audit transition, and returns timing windows.
//
// It NEVER forces a trade, never fabricates missing VIX/news/OI, and never
// silently moves locked levels. All thresholds come from intelConfig.loop.
// =====================================================================

import { getLiveSignalWithData } from "./liveTradePlan.service";
import { fuseIntelligence, getBreadth, newsIdentity, type MarketIntelligence, type NewsDecisionImpact } from "./marketIntelligence.service";
import type { NewsItem } from "./news.service";
import { getVix } from "./vix.service";
import { getRelevantNews } from "./news.service";
import { classifyRegime, detectSetups, type Regime, type SetupCandidate } from "./setupDetectors";
import { connorsRSI, chandelierExit, rangeFilter, hacolt, atrSeries, type ChandelierResult } from "./strategyIndicators";
import { applyTransition, stateKey, type LoopAction, type LoopState, type Transition } from "./decisionState";
import { intelConfig } from "../config/intelligence.config";
import type { Candle, RiskProfile } from "./technicalAnalysis";
import type { ResolveQuery } from "./resolveInput";

type InputState = "AVAILABLE_FRESH" | "AVAILABLE_STALE" | "UNAVAILABLE" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA";

export interface PositionInput {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  quantity?: number;
  stopLoss?: number | null;
  targets?: number[];
}

export interface DecisionSnapshot {
  instrument: string;
  displayName: string;
  interval: string;
  riskProfile: RiskProfile;
  timestamp: string; // ISO with ms
  cmp: number;
  action: LoopAction; // effective (post-hysteresis)
  proposedAction: LoopAction; // what THIS tick suggests (pre-hysteresis)
  state: LoopState;
  stateSinceMs: number;
  transitioned: boolean;
  pending: { action: LoopAction; count: number; required: number } | null;
  reason: string;
  regime: Regime;
  regimeReasons: string[];
  bias: MarketIntelligence["bias"];
  risk: MarketIntelligence["risk"];
  confidence: number;
  approval: { current: "APPROVED" | "NOT APPROVED" | "N/A"; winEstimate: number; setupStrength: number; minWin: number; minConfidence: number };
  dataQuality: { overall: "OK" | "DEGRADED" | "STALE"; inputs: { name: string; state: InputState; note?: string }[] };
  plan: { direction: "LONG" | "SHORT"; trigger: number | null; safeZone: { lo: number; hi: number } | null; entry: number; stopLoss: number; targets: number[]; invalidation: number; rr: number | null; source: "position" | "candidate"; triggered: boolean; inSafeZone: boolean } | null;
  freshSetup: { direction: "LONG" | "SHORT"; label: string; trigger: number | null; stop: number; targets: number[]; confidence: number; whyDiffers: string } | null;
  scores: { technical: number; priceAction: number; trend: number; momentum: number; volumeOi: number; vix: number; news: number; market: number; risk: number };
  supporting: string[];
  blocking: string[];
  conflicts: string[];
  chandelier: ChandelierResult | null;
  exit: { status: "HOLD" | "HOLD WITH CAUTION" | "TRAIL STOP" | "PARTIAL PROFIT" | "EXIT WARNING" | "EXIT NOW"; trailStop: number | null; reasons: string[] } | null;
  timing: { entryWindow: string; exitWindow: string; nextConfirmation: string };
  setups: SetupCandidate[];
  vix: MarketIntelligence["vix"];
  newsSummary: { available: boolean; matched: number; total: number; label: string; message?: string };
  newsDecisionImpact: NewsDecisionImpact;
  relevantNews: NewsItem[]; // decision-relevant headlines only (DIRECT/UNDERLYING/SECTOR)
  marketContext: NewsItem[]; // benchmark/macro/market-wide context (separate, non-deciding)
  trend: MarketIntelligence["trend"];
  history: Transition[];
  readOnly: true;
  disclaimer: string;
}

function intervalMs(interval: string): number {
  if (interval === "day") return 24 * 60 * 60 * 1000;
  const n = parseInt(interval, 10);
  if (interval.includes("hour")) return (Number.isFinite(n) ? n : 1) * 3_600_000;
  if (interval.includes("minute")) return (Number.isFinite(n) ? n : 1) * 60_000;
  return 5 * 60_000;
}

function candleAgeMs(candles: Candle[] | null): number | null {
  if (!candles || candles.length === 0) return null;
  const t = Date.parse(candles[candles.length - 1].t);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Date.now() - t);
}

function scale(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)));
}

export async function getDecision(
  opts: { interval?: string; riskProfile?: string; position?: PositionInput } & ResolveQuery,
): Promise<DecisionSnapshot> {
  const cfg = intelConfig.loop;
  // STEP 1 — INGEST (one fetch → signal + candles).
  const { signal, candles, interval } = await getLiveSignalWithData(opts);
  const identity = newsIdentity(signal);
  const [vix, relNews, breadth] = await Promise.all([getVix(), getRelevantNews(identity), getBreadth()]);
  const intel = fuseIntelligence(signal, vix, relNews, breadth);
  const riskProfile = (opts.riskProfile as RiskProfile) ?? "balanced";
  const price = signal.currentPrice;
  const isFO = ["FUT", "CE", "PE"].includes(signal.resolvedInstrument.instrumentType);

  // STEP 2 — DATA-QUALITY GATE.
  const ageMs = candleAgeMs(candles);
  const staleCutoff = cfg.dataQuality.candleStaleIntervals * intervalMs(interval);
  const candleState: InputState = !candles || candles.length === 0 ? "UNAVAILABLE" : candles.length < cfg.dataQuality.minCandles ? "INSUFFICIENT_DATA" : ageMs != null && ageMs > staleCutoff ? "AVAILABLE_STALE" : "AVAILABLE_FRESH";
  const priceState: InputState = price > 0 ? "AVAILABLE_FRESH" : "UNAVAILABLE";
  const warmedUp = !!candles && candles.length >= cfg.dataQuality.warmupCandles;
  const dqInputs: { name: string; state: InputState; note?: string }[] = [
    { name: "Live price", state: priceState },
    { name: "Candles", state: candleState, note: ageMs != null ? `${Math.round(ageMs / 1000)}s old` : undefined },
    { name: "Indicators", state: warmedUp ? "AVAILABLE_FRESH" : candles && candles.length ? "INSUFFICIENT_DATA" : "UNAVAILABLE" },
    { name: "VIX", state: vix.available ? "AVAILABLE_FRESH" : "UNAVAILABLE" },
    { name: "News", state: relNews.available ? "AVAILABLE_FRESH" : "UNAVAILABLE" },
    { name: "Breadth", state: breadth.ok ? "AVAILABLE_FRESH" : "UNAVAILABLE" },
    { name: "Open interest", state: isFO ? (signal.indicators.oi != null ? "AVAILABLE_FRESH" : "UNAVAILABLE") : "NOT_APPLICABLE" },
  ];
  const priceOrCandleStale = priceState === "UNAVAILABLE" || candleState === "AVAILABLE_STALE" || candleState === "UNAVAILABLE";
  const dqOverall: "OK" | "DEGRADED" | "STALE" = priceOrCandleStale ? "STALE" : candleState === "INSUFFICIENT_DATA" ? "DEGRADED" : "OK";

  // STEP 3/4 — strategy indicators + regime.
  const closes = (candles ?? []).map((c) => c.c);
  const cRSI = candles ? connorsRSI(closes, cfg.connors) : null;
  const chand = candles ? chandelierExit(candles, cfg.chandelier) : null;
  const rf = candles ? rangeFilter(closes, cfg.rangeFilter) : null;
  const hac = candles ? hacolt(candles, cfg.hacolt.emaPeriod) : null;
  const atrArr = candles ? atrSeries(candles, cfg.regime.atrLookback) : [];
  const atrNow = signal.indicators.atr;
  let atrExpansionPct: number | null = null;
  if (atrNow != null && atrArr.length) {
    const recent = atrArr.filter((v): v is number => v != null).slice(-cfg.regime.atrLookback);
    const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : null;
    if (avg && avg > 0) atrExpansionPct = Math.round((atrNow / avg - 1) * 100);
  }
  const newsShock = intel.sentiment.strongNegative || intel.sentiment.strongPositive;
  const vixHigh = vix.available && vix.status === "high";

  const ctx = {
    candles: candles ?? [], price, atr: atrNow, ema20: signal.indicators.ema20, ema50: signal.indicators.ema50,
    trendEma: signal.indicators.ema50, vwap: signal.marketData.vwap, adx: signal.indicators.adx, supertrend: signal.indicators.supertrend,
    connorsRSI: cRSI, chandelier: chand, rangeFilter: rf, hacolt: hac, volumeConfirmed: signal.indicators.volumeConfirmed,
    riskProfile, newsShock, atrExpansionPct, vixHigh,
  };
  const { regime, reasons: regimeReasons } = classifyRegime(ctx);
  const setups = candles ? detectSetups(ctx, regime) : [];
  const bestPrimary = setups.find((s) => !s.secondary) ?? null;

  // STEP 6/7 — position exit engine (only when a position is supplied).
  const exit = opts.position ? evaluateExit(opts.position, ctx, signal, chand) : null;

  // STEP 12 — conflicts (explicit contradictions).
  const conflicts = findConflicts(intel, bestPrimary, regime, signal);

  // STEP 13 — scores (each exposed separately; no hidden merge).
  const scores = {
    technical: scale(signal.probability.bullishPercent, 0, 100),
    priceAction: signal.marketData.vwap != null ? (price >= signal.marketData.vwap ? 65 : 35) : 50,
    trend: scale((intel.trend.breadthScore + 1) * 50, 0, 100),
    momentum: signal.indicators.rsi != null ? scale(signal.indicators.rsi, 20, 80) : 50,
    volumeOi: signal.indicators.volumeConfirmed == null ? 50 : signal.indicators.volumeConfirmed ? 70 : 35,
    vix: vix.available ? scale((vix.score + 1) * 50, 0, 100) : 50,
    news: relNews.available ? scale((clampNews(intel.sentiment.marketScore) + 1) * 50, 0, 100) : 50,
    market: scale((intel.trend.breadthScore + 1) * 50, 0, 100),
    risk: intel.risk === "Low" ? 75 : intel.risk === "Medium" ? 50 : 25,
  };

  // STEP 14 — propose action + state (deferring to the intelligence gates, then
  // layering the loop's data-quality / safe-zone / position rules).
  const proposal = proposeActionState({ intel, exit, bestPrimary, dqOverall, hasPosition: !!opts.position, price, conflicts });

  // STEP 15/16 — plan (position OR best candidate). Locked levels never move here.
  const plan = buildPlan(opts.position, bestPrimary, signal);

  // Fresh-setup candidate (§13): a triggered primary that opposes an existing
  // position, or a new primary when idle. Requires explicit Lock unless autoLock.
  const freshSetup = detectFreshSetup(bestPrimary, opts.position, cfg.autoLock);

  // STEP 15 — stateful transition + audit (anti-flicker hysteresis).
  const key = stateKey(signal.resolvedInstrument.instrumentKey, interval, riskProfile);
  const t = applyTransition(key, {
    action: proposal.action, state: proposal.state, critical: proposal.critical, reason: proposal.reason,
    cmp: price, trigger: plan?.trigger ?? null, confidence: intel.confidence, winEstimate: intel.winEstimate,
    vix: vix.available ? vix.value : null, newsScore: clampNews(intel.sentiment.marketScore), marketTrend: regime,
    supporting: intel.supporting, blocking: [...intel.blocking, ...conflicts],
  });

  // Current approval reflects the LIVE state — never a stale locked strength.
  const approvedNow = t.action === "ENTER" || t.state === "ENTRY_APPROVED";
  const setupStrength = bestPrimary?.confidence ?? 0;
  const approval = {
    current: (opts.position ? "N/A" : approvedNow ? "APPROVED" : "NOT APPROVED") as "APPROVED" | "NOT APPROVED" | "N/A",
    winEstimate: intel.winEstimate, setupStrength, minWin: intelConfig.decision.winThreshold, minConfidence: intelConfig.decision.minEnterConfidence,
  };

  // STEP 16 — timing windows.
  const timing = buildTiming(t.action, exit, bestPrimary, ctx, interval);

  return {
    instrument: signal.resolvedInstrument.instrumentKey,
    displayName: signal.resolvedInstrument.displayName || signal.instrument,
    interval, riskProfile, timestamp: new Date().toISOString(), cmp: price,
    action: t.action, proposedAction: proposal.action, state: t.state, stateSinceMs: t.stateSinceMs, transitioned: t.transitioned, pending: t.pending,
    reason: dqOverall === "STALE" && !opts.position ? "Market data stale — no fresh entry until data is live." : proposal.reason,
    regime, regimeReasons, bias: intel.bias, risk: intel.risk, confidence: intel.confidence, approval,
    dataQuality: { overall: dqOverall, inputs: dqInputs },
    plan, freshSetup, scores,
    supporting: intel.supporting, blocking: intel.blocking, conflicts,
    chandelier: chand, exit,
    timing, setups,
    vix,
    newsSummary: { available: relNews.available, matched: intel.newsDecisionImpact.directRelevantCount, total: relNews.items.length, label: intel.sentiment.label, message: relNews.message },
    newsDecisionImpact: intel.newsDecisionImpact,
    relevantNews: intel.newsMatched,
    marketContext: intel.marketContext,
    trend: intel.trend, history: t.history, readOnly: true, disclaimer: signal.disclaimer,
  };
}

function clampNews(n: number): number {
  return Math.max(-1, Math.min(1, n / intelConfig.decision.newsBiasDivisor));
}

/* --------------------------- position exit engine ------------------------ */
function evaluateExit(pos: PositionInput, ctx: { price: number; vwap: number | null; ema20: number | null; supertrend: { direction: "bullish" | "bearish" } | null }, signal: Awaited<ReturnType<typeof getLiveSignalWithData>>["signal"], chand: ChandelierResult | null): DecisionSnapshot["exit"] {
  const long = pos.direction === "LONG";
  const price = ctx.price;
  const reasons: string[] = [];
  const inval = signal.finalDecision.invalidationLevel;

  // Hard stop / invalidation = critical EXIT NOW.
  if (pos.stopLoss != null && ((long && price <= pos.stopLoss) || (!long && price >= pos.stopLoss))) {
    return { status: "EXIT NOW", trailStop: chand ? (long ? chand.longStop : chand.shortStop) : null, reasons: [`Hard stop ${pos.stopLoss} hit.`] };
  }
  if (inval && ((long && price < inval) || (!long && price > inval))) {
    return { status: "EXIT NOW", trailStop: null, reasons: [`Invalidation ${inval} broken against the ${pos.direction.toLowerCase()}.`] };
  }
  // Chandelier flip against the position + structure = EXIT WARNING.
  const chandAgainst = chand && ((long && chand.direction === -1) || (!long && chand.direction === 1));
  const stAgainst = ctx.supertrend && ((long && ctx.supertrend.direction === "bearish") || (!long && ctx.supertrend.direction === "bullish"));
  const vwapFail = ctx.vwap != null && ((long && price < ctx.vwap) || (!long && price > ctx.vwap));
  if (chandAgainst && (stAgainst || vwapFail)) {
    reasons.push("Chandelier Exit flipped against the position with structure confirming.");
    return { status: "EXIT WARNING", trailStop: chand ? (long ? chand.longStop : chand.shortStop) : null, reasons };
  }
  // Target reached → partial.
  const t1 = pos.targets && pos.targets.length ? pos.targets[0] : null;
  if (t1 != null && ((long && price >= t1) || (!long && price <= t1))) {
    return { status: "PARTIAL PROFIT", trailStop: chand ? (long ? chand.longStop : chand.shortStop) : null, reasons: [`Target 1 ${t1} reached — consider booking part / trailing.`] };
  }
  if (vwapFail || stAgainst) {
    reasons.push(vwapFail ? "Price on the wrong side of VWAP." : "Supertrend against the position.");
    return { status: "HOLD WITH CAUTION", trailStop: chand ? (long ? chand.longStop : chand.shortStop) : null, reasons };
  }
  // Trailing advance.
  if (chand) {
    const trail = long ? chand.longStop : chand.shortStop;
    if ((long && trail > (pos.stopLoss ?? -Infinity)) || (!long && trail < (pos.stopLoss ?? Infinity))) {
      return { status: "TRAIL STOP", trailStop: trail, reasons: [`Chandelier trail at ${trail} (advisory — locked stop unchanged).`] };
    }
  }
  return { status: "HOLD", trailStop: chand ? (long ? chand.longStop : chand.shortStop) : null, reasons: ["Structure intact — no exit trigger."] };
}

/* ---------------------------- action / state ----------------------------- */
function proposeActionState(a: { intel: MarketIntelligence; exit: DecisionSnapshot["exit"]; bestPrimary: SetupCandidate | null; dqOverall: "OK" | "DEGRADED" | "STALE"; hasPosition: boolean; price: number; conflicts: string[] }): { action: LoopAction; state: LoopState; critical: boolean; reason: string } {
  // Position present → the exit engine drives HOLD/EXIT.
  if (a.hasPosition && a.exit) {
    switch (a.exit.status) {
      case "EXIT NOW": return { action: "EXIT", state: "EXIT_APPROVED", critical: true, reason: a.exit.reasons[0] ?? "Exit conditions met." };
      case "EXIT WARNING": return { action: "HOLD", state: "EXIT_WARNING", critical: false, reason: a.exit.reasons[0] ?? "Exit risk rising." };
      case "TRAIL STOP": return { action: "HOLD", state: "TRAILING", critical: false, reason: a.exit.reasons[0] ?? "Trailing stop advancing." };
      case "PARTIAL PROFIT": return { action: "HOLD", state: "HOLDING", critical: false, reason: a.exit.reasons[0] ?? "Target reached." };
      case "HOLD WITH CAUTION": return { action: "HOLD", state: "HOLDING", critical: false, reason: a.exit.reasons[0] ?? "Hold with caution." };
      default: return { action: "HOLD", state: "HOLDING", critical: false, reason: "Structure intact — hold." };
    }
  }
  // No position, stale data → never ENTER.
  if (a.dqOverall === "STALE") return { action: "NO ACTION", state: "WATCHING", critical: false, reason: "Market data stale — waiting for fresh data." };

  const fa = a.intel.finalAction;
  if (fa === "AVOID") return { action: "AVOID", state: "WATCHING", critical: false, reason: a.intel.reason };
  if (fa === "NO ACTION") return { action: "NO ACTION", state: "WATCHING", critical: false, reason: a.intel.reason };
  if (fa === "ENTER") {
    // Gate ENTER on a real, triggered, in-safe-zone primary candidate.
    if (!a.bestPrimary || !a.bestPrimary.triggered) return { action: "WAIT", state: a.bestPrimary ? "WAITING_FOR_TRIGGER" : "WATCHING", critical: false, reason: a.bestPrimary ? "Setup detected — trigger not reached." : "No qualified setup yet." };
    if (!a.bestPrimary.inSafeZone) return { action: "WAIT", state: "WAITING_FOR_TRIGGER", critical: false, reason: "Price ran past the safe entry zone — wait for a pullback." };
    if (a.conflicts.length > 0) return { action: "WAIT", state: "SETUP_DETECTED", critical: false, reason: `Holding back — ${a.conflicts[0]}` };
    return { action: "ENTER", state: "ENTRY_APPROVED", critical: false, reason: a.intel.reason };
  }
  // WAIT / HOLD-from-intel with no position → WATCHING/SETUP_DETECTED.
  if (a.bestPrimary) return { action: "WAIT", state: a.bestPrimary.triggered ? "SETUP_DETECTED" : "WAITING_FOR_TRIGGER", critical: false, reason: a.intel.reason };
  return { action: fa === "HOLD" ? "NO ACTION" : "WAIT", state: "WATCHING", critical: false, reason: a.intel.reason };
}

function buildPlan(pos: PositionInput | undefined, cand: SetupCandidate | null, signal: Awaited<ReturnType<typeof getLiveSignalWithData>>["signal"]): DecisionSnapshot["plan"] {
  if (pos) {
    return { direction: pos.direction, trigger: null, safeZone: null, entry: pos.entryPrice, stopLoss: pos.stopLoss ?? signal.finalDecision.invalidationLevel, targets: pos.targets ?? [], invalidation: signal.finalDecision.invalidationLevel, rr: null, source: "position", triggered: true, inSafeZone: true };
  }
  if (cand) {
    return { direction: cand.direction, trigger: cand.trigger, safeZone: cand.safeZone, entry: cand.trigger ?? signal.currentPrice, stopLoss: cand.stop, targets: cand.targets, invalidation: cand.stop, rr: cand.rr, source: "candidate", triggered: cand.triggered, inSafeZone: cand.inSafeZone };
  }
  return null;
}

function detectFreshSetup(cand: SetupCandidate | null, pos: PositionInput | undefined, autoLock: boolean): DecisionSnapshot["freshSetup"] {
  if (!cand || cand.secondary) return null;
  if (pos && cand.direction !== pos.direction && cand.triggered) {
    return { direction: cand.direction, label: cand.label, trigger: cand.trigger, stop: cand.stop, targets: cand.targets, confidence: cand.confidence, whyDiffers: `Opposes the current ${pos.direction} position. Lock New Plan to switch bias${autoLock ? " (auto-lock on)" : ""}.` };
  }
  return null;
}

function findConflicts(intel: MarketIntelligence, cand: SetupCandidate | null, regime: Regime, signal: Awaited<ReturnType<typeof getLiveSignalWithData>>["signal"]): string[] {
  const out: string[] = [];
  const bull = intel.technical.action === "LONG";
  const bear = intel.technical.action === "SHORT";
  if ((bull || bear) && intel.sentiment.strongNegative && bull) out.push("Technicals lean long but a high-impact negative headline is active.");
  if (cand?.type === "connors-rsi" && cand.direction === "LONG" && regime === "STRONG_DOWNTREND") out.push("RSI oversold long inside a strong downtrend.");
  if ((cand?.type === "breakout" || cand?.type === "breakdown") && signal.indicators.volumeConfirmed === false) out.push("Break attempt without volume expansion (false-break risk).");
  if ((bull || bear) && Math.sign(intel.trend.breadthScore) !== 0 && ((bull && intel.trend.breadthScore < -0.2) || (bear && intel.trend.breadthScore > 0.2))) out.push("Instrument direction conflicts with market breadth.");
  if (cand && cand.triggered && !cand.inSafeZone) out.push("Trigger reached but price is outside the safe entry zone.");
  return out;
}

function buildTiming(action: LoopAction, exit: DecisionSnapshot["exit"], cand: SetupCandidate | null, ctx: { price: number; atr: number | null; vwap: number | null }, interval: string): DecisionSnapshot["timing"] {
  const tf = interval.replace("minute", "m").replace("hour", "h");
  let entryWindow = "No valid entry window yet.";
  if (action === "ENTER") entryWindow = "Entry window: now — trigger met and inside the safe zone.";
  else if (cand && !cand.triggered && cand.trigger != null && ctx.atr) {
    const dist = Math.abs(ctx.price - cand.trigger);
    const n = Math.min(5, Math.max(1, Math.ceil(dist / (0.5 * ctx.atr))));
    entryWindow = `Possible entry window: next ${n === 1 ? "1 closed candle" : `1–${n} closed candles`} (${tf}) if the ${cand.direction === "LONG" ? "breakout above" : "breakdown below"} ${cand.trigger} holds.`;
  } else if (cand && cand.triggered && !cand.inSafeZone) {
    entryWindow = "No immediate window — price ran past the zone; wait for a pullback.";
  }
  const exitWindow = exit
    ? exit.status === "EXIT NOW" ? "Exit now — a hard stop/invalidation triggered." : exit.status === "EXIT WARNING" ? "Exit risk rising — structure is turning against the position." : exit.status === "TRAIL STOP" ? `Trailing: manage against ${exit.trailStop ?? "the advisory trail"}.` : "Holding — no exit trigger yet."
    : "No open position to manage.";
  const nextConfirmation = cand && !cand.triggered ? `Next confirmation: a closed ${tf} candle beyond ${cand.trigger}.` : exit && exit.status !== "HOLD" ? "Next confirmation: a closed candle confirming/denying the exit signal." : "Next confirmation: awaiting the next closed candle.";
  return { entryWindow, exitWindow, nextConfirmation };
}
