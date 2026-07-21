// =====================================================================
// Real-time decision pipeline — PURE. One COHERENT snapshot from ONE market state.
// ---------------------------------------------------------------------
//   tick-built candle series
//     → indicators (intrabar, from the forming series)  + last-CLOSED indicators
//     → evidence aggregation (trend / momentum / volume / volatility / structure)
//     → live win estimate + setup strength
//     → entry/exit state machine against the LOCKED plan
//     → versioned, timestamped decision snapshot (+ freshness + latency)
//
// This removes the frontend's old "live CMP + 5-second-old indicators" mismatch:
// CMP, indicators, evidence, win and action here all derive from the SAME candle
// state. The live glue (realtimeDecisionManager) drives this per Kite tick; the
// replay harness drives it with synthetic ticks — both exercise this exact path,
// so the pipeline is provable without a live socket.
//
// Reuses existing engines (buildLiveSignal, computeIndicators, entryStateMachine)
// and types — no duplicated indicator/state math. Levels are LOCKED; only the
// action/approval/evidence change per tick.
// =====================================================================

import { performance } from "node:perf_hooks";
import type { Candle } from "./technicalAnalysis";
import { computeIndicators, parseActiveIndicators, type IndicatorId, type IndicatorValues, type IndicatorContribution } from "./indicatorEngine";
import { buildLiveSignal } from "./liveSignal";
import { evaluateEntry, evaluateExit, DEFAULT_ENTRY_GATES, type EntryGates, type PositionInput, type EntryState, type ExitState } from "./entryStateMachine";

export type DecisionAction = EntryState | ExitState;

export interface LockedPlan {
  direction: "LONG" | "SHORT";
  entry: number;
  safeLow: number;
  safeHigh: number;
  stop: number;
  target1: number;
  target2: number | null;
  invalidation: number;
  atr: number | null;
  analysedCmp: number;
  analysedAtMs: number | null;
}

/** Slower, event-driven context (news/VIX/benchmark) folded into the snapshot. */
export interface DecisionContext {
  vix: number | null;
  vixStatus: string | null;
  newsLabel: string | null;
  newsRelevantCount: number;
  benchmarkAligned: boolean | null;
  /** When each context input was last refreshed (epoch ms), for freshness. */
  vixTsMs: number | null;
  newsTsMs: number | null;
  benchmarkTsMs: number | null;
}

export type EvidenceCat = "trend" | "momentum" | "volume" | "volatility" | "structure";
export interface EvidenceCategory {
  category: EvidenceCat;
  direction: "bullish" | "bearish" | "neutral";
  score: number; // net (bullish − bearish) weight within the category
  items: string[]; // "EMA20:bullish", …
}

export interface DecisionFreshness {
  tickTsMs: number | null; // exchange/source instant
  tickReceivedMs: number; // relay receipt instant
  candleCalcMs: number; // forming-candle update instant
  indicatorCalcMs: number; // indicator calc instant
  decisionCalcMs: number; // decision calc instant
  vixTsMs: number | null;
  newsTsMs: number | null;
  benchmarkTsMs: number | null;
  formingCandle: boolean;
  lastClosedTsMs: number | null;
  tickAgeMs: number;
  stale: boolean; // a MANDATORY input is outside its freshness limit
  blockReason: string | null;
}

export interface DecisionTimings {
  indicatorMs: number;
  decisionMs: number;
  totalMs: number;
}

export interface RealtimeDecisionSnapshot {
  seq: number;
  instrument: string;
  interval: string;
  cmp: number;
  candle: { forming: Candle | null; formingClosed: boolean; lastClosed: Candle | null };
  indicators: IndicatorValues; // intrabar (from the forming series)
  indicatorsClosed: IndicatorValues | null; // last-CLOSED confirmation (§4B)
  evidence: EvidenceCategory[];
  trend: { direction: string; strength: string; score: number };
  winEstimate: number;
  setupStrength: number;
  action: DecisionAction;
  approved: boolean;
  lateEntry: boolean;
  remainingRR: number | null;
  distanceToEntry: number | null;
  reasons: string[];
  freshness: DecisionFreshness;
  timings: DecisionTimings;
}

// One evidence category per implemented indicator (correlated indicators share a
// category so they are NOT double-counted as independent confirmations — §11).
const CATEGORY: Record<IndicatorId, EvidenceCat> = {
  EMA20: "trend",
  EMA50: "trend",
  SUPERTREND: "trend",
  ADX: "trend",
  RSI: "momentum",
  MACD: "momentum",
  VOLUME: "volume",
  OI: "volume",
  ATR: "volatility",
  VWAP: "structure",
};

export interface FreshnessLimits {
  tickMs: number; // tick older than this ⇒ block fresh entry
  contextMs: number; // vix/news/benchmark older than this ⇒ context stale (advisory)
}

export const DEFAULT_FRESHNESS: FreshnessLimits = { tickMs: 5_000, contextMs: 120_000 };

export interface DecisionInput {
  seq: number;
  instrument: string;
  interval: string;
  candles: Candle[]; // tick-built series; the last element is the forming candle unless formingClosed
  formingClosed: boolean;
  plan: LockedPlan;
  position?: PositionInput | null;
  context?: DecisionContext | null;
  activeIndicators?: IndicatorId[];
  riskProfile?: "conservative" | "balanced" | "aggressive";
  lotSize?: number | null;
  oi?: number | null;
  gates?: EntryGates;
  freshness?: FreshnessLimits;
  nowMs: number; // the "as of" instant (tick receipt) — deterministic in tests
  tickTsMs?: number | null; // exchange timestamp of the driving tick
  tickReceivedMs?: number; // relay receipt of the driving tick
  candleCalcMs?: number; // when the forming candle was last updated
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Aggregate raw indicator contributions into the five evidence categories. */
export function aggregateEvidence(contributions: IndicatorContribution[]): EvidenceCategory[] {
  const buckets = new Map<EvidenceCat, { score: number; items: string[] }>();
  for (const c of contributions) {
    const cat = CATEGORY[c.id];
    if (!cat) continue;
    const b = buckets.get(cat) ?? { score: 0, items: [] };
    if (c.direction === "bullish") b.score += c.weight;
    else if (c.direction === "bearish") b.score -= c.weight;
    if (c.direction === "bullish" || c.direction === "bearish") b.items.push(`${c.id}:${c.direction}`);
    buckets.set(cat, b);
  }
  const order: EvidenceCat[] = ["trend", "momentum", "volume", "volatility", "structure"];
  return order
    .filter((cat) => buckets.has(cat))
    .map((cat) => {
      const b = buckets.get(cat)!;
      return { category: cat, direction: b.score > 0 ? "bullish" : b.score < 0 ? "bearish" : "neutral", score: r2(b.score), items: b.items } as EvidenceCategory;
    });
}

/** Build ONE coherent real-time decision snapshot from the current candle state. */
export function buildDecisionSnapshot(input: DecisionInput): RealtimeDecisionSnapshot {
  const t0 = performance.now();
  const active = input.activeIndicators?.length ? input.activeIndicators : parseActiveIndicators(undefined);
  const candles = input.candles;
  const long = input.plan.direction === "LONG";
  const last = candles[candles.length - 1] ?? null;
  const cmp = last ? r2(last.c) : input.plan.analysedCmp;

  // Forming vs last-CLOSED separation (§4B) — never label a forming value confirmed.
  const forming = input.formingClosed ? null : last;
  const closedSeries = input.formingClosed ? candles : candles.slice(0, -1);
  const lastClosed = closedSeries[closedSeries.length - 1] ?? null;

  // Intrabar indicators (forming series) + a separate closed-candle snapshot.
  const tInd = performance.now();
  const indicators = computeIndicators(candles, input.oi ?? null);
  const indicatorsClosed = closedSeries.length >= 20 ? computeIndicators(closedSeries, input.oi ?? null) : null;
  const indicatorMs = performance.now() - tInd;

  // Live evidence + win via the existing signal engine (pure) on the SAME series.
  const seriesHigh = candles.reduce((m, c) => Math.max(m, c.h), -Infinity);
  const seriesLow = candles.reduce((m, c) => Math.min(m, c.l), Infinity);
  const sig = buildLiveSignal({
    instrument: input.instrument,
    quote: { lastPrice: cmp, open: candles[0]?.o ?? cmp, high: Number.isFinite(seriesHigh) ? seriesHigh : cmp, low: Number.isFinite(seriesLow) ? seriesLow : cmp, previousClose: lastClosed?.c ?? cmp, volume: last?.v ?? 0 },
    candles,
    riskProfile: input.riskProfile ?? "balanced",
    lotSize: input.lotSize ?? null,
    activeIndicators: active,
    oi: input.oi ?? null,
    timestamp: new Date(input.nowMs).toISOString(),
  });

  const evidence = aggregateEvidence(sig.indicatorContributions);
  const confirming = sig.indicatorContributions.filter((c) => c.direction === (long ? "bullish" : "bearish"));
  const opposing = sig.indicatorContributions.filter((c) => c.direction === (long ? "bearish" : "bullish"));
  const directional = confirming.length + opposing.length;
  const setupStrength = directional > 0 ? Math.round((confirming.length / directional) * 100) : 0;
  const winEstimate = sig.probability.estimatedWinPercent;
  const reversalSignals = opposing.length;

  // Freshness contract (§14): the snapshot is internally coherent (CMP + indicators
  // from the same candle), so "stale" here means the DRIVING TICK itself aged out.
  const tickReceivedMs = input.tickReceivedMs ?? input.nowMs;
  const tickAgeMs = Math.max(0, input.nowMs - tickReceivedMs);
  const tickStale = tickAgeMs > (input.freshness ?? DEFAULT_FRESHNESS).tickMs;

  // State machine against the LOCKED plan (§6). Position → exit; else entry scan.
  const gates = input.gates ?? DEFAULT_ENTRY_GATES;
  const tDec = performance.now();
  let action: DecisionAction;
  let approved: boolean;
  let lateEntry = false;
  let remainingRR: number | null = null;
  let distanceToEntry: number | null = null;
  const reasons: string[] = [];
  if (input.position) {
    const ex = evaluateExit(input.position, cmp, reversalSignals, directional);
    action = ex.state;
    approved = ex.approved;
    reasons.push(ex.reason);
  } else {
    const en = evaluateEntry(
      input.plan.direction,
      cmp,
      { entry: input.plan.entry, safeLow: input.plan.safeLow, safeHigh: input.plan.safeHigh, stop: input.plan.stop, target1: input.plan.target1, invalidation: input.plan.invalidation, atr: input.plan.atr },
      { winEstimate, setupStrength, reversalSignals, dataStale: tickStale, evidenceStale: false },
      gates,
    );
    action = en.state;
    approved = en.approved;
    lateEntry = en.lateEntry;
    remainingRR = en.remainingRR;
    distanceToEntry = en.distanceToEntry;
    reasons.push(en.reason);
  }
  const decisionMs = performance.now() - tDec;

  const blockReason = tickStale ? `Driving tick is ${Math.round(tickAgeMs)}ms old (> ${(input.freshness ?? DEFAULT_FRESHNESS).tickMs}ms) — fresh entry blocked.` : null;

  return {
    seq: input.seq,
    instrument: input.instrument,
    interval: input.interval,
    cmp,
    candle: { forming, formingClosed: input.formingClosed, lastClosed },
    indicators,
    indicatorsClosed,
    evidence,
    trend: { direction: sig.trend.direction, strength: sig.trend.strength, score: sig.trend.score },
    winEstimate,
    setupStrength,
    action,
    approved,
    lateEntry,
    remainingRR,
    distanceToEntry,
    reasons,
    freshness: {
      tickTsMs: input.tickTsMs ?? null,
      tickReceivedMs,
      candleCalcMs: input.candleCalcMs ?? input.nowMs,
      indicatorCalcMs: input.nowMs,
      decisionCalcMs: input.nowMs,
      vixTsMs: input.context?.vixTsMs ?? null,
      newsTsMs: input.context?.newsTsMs ?? null,
      benchmarkTsMs: input.context?.benchmarkTsMs ?? null,
      formingCandle: !input.formingClosed,
      lastClosedTsMs: lastClosed && !Number.isNaN(Date.parse(lastClosed.t)) ? Date.parse(lastClosed.t) : null,
      tickAgeMs,
      stale: tickStale,
      blockReason,
    },
    timings: { indicatorMs: r2(indicatorMs), decisionMs: r2(decisionMs), totalMs: r2(performance.now() - t0) },
  };
}
