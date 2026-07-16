// =====================================================================
// Live Trade Plan — orchestration (Phase 3B, READ-ONLY)
// ---------------------------------------------------------------------
// Combines a live Kite quote with (when available) historical candles and
// runs the pure technical-analysis engine to produce long/short levels.
//
// READ-ONLY: no order placement/modification/cancellation, no GTT/baskets.
// Output always carries the risk disclaimer; no profit is guaranteed.
// =====================================================================

import * as kite from "./kite.service";
import { KiteError } from "./kite.service";
import { resolveInstrumentInput, type ResolveQuery } from "./resolveInput";
import { buildLiveSignal, type LiveSignalResult } from "./liveSignal";
import { DEFAULT_INDICATORS, type IndicatorId } from "./indicatorEngine";
import { buildChartData } from "./chartData";
import { computeSessionOhlc, intervalToMs, type SessionOhlc } from "./sessionOhlc";
import { evaluatePosition, type MonitorResult, type PositionDirection } from "./activeTradeMonitor";
import {
  buildLiveTradePlan,
  type Candle,
  type LiveTradePlanResult,
  type RiskProfile,
} from "./technicalAnalysis";

const VALID_INTERVALS = new Set([
  "minute",
  "3minute",
  "5minute",
  "10minute",
  "15minute",
  "30minute",
  "60minute",
  "day",
]);

const VALID_RISK: ReadonlySet<RiskProfile> = new Set<RiskProfile>([
  "conservative",
  "balanced",
  "aggressive",
]);

export function normaliseInterval(raw: string | undefined): string {
  const v = (raw ?? "5minute").trim();
  return VALID_INTERVALS.has(v) ? v : "5minute";
}

export function normaliseRiskProfile(raw: string | undefined): RiskProfile {
  const v = (raw ?? "balanced").trim() as RiskProfile;
  return VALID_RISK.has(v) ? v : "balanced";
}

/** How many days of history to request for a given interval. */
function historyWindowDays(interval: string): number {
  if (interval === "day") return 200;
  if (interval === "60minute" || interval === "30minute") return 60;
  return 15; // intraday minute intervals
}

function fmt(d: Date): string {
  // Kite expects "yyyy-mm-dd HH:MM:SS"
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/** Kite historical candles come as arrays: [ts, open, high, low, close, volume]. */
function parseCandles(raw: unknown): Candle[] {
  const arr = (raw as { candles?: unknown })?.candles;
  if (!Array.isArray(arr)) return [];
  const out: Candle[] = [];
  for (const row of arr) {
    if (Array.isArray(row) && row.length >= 6) {
      out.push({
        t: String(row[0]),
        o: Number(row[1]),
        h: Number(row[2]),
        l: Number(row[3]),
        c: Number(row[4]),
        v: Number(row[5]),
      });
    }
  }
  return out;
}

/**
 * Build a live trade plan for an instrument. Read-only.
 * Always fetches the live quote; attempts historical candles when an
 * instrument_token is available, and downgrades gracefully if they are not.
 */
export async function getLiveTradePlan(
  opts: {
    interval?: string;
    riskProfile?: string;
  } & ResolveQuery,
): Promise<LiveTradePlanResult> {
  const interval = normaliseInterval(opts.interval);
  const riskProfile = normaliseRiskProfile(opts.riskProfile);

  // 0) Resolve the input to an exact instrument (accepts exact symbol OR F&O
  //    params). Throws a clean KiteError with candidates if ambiguous.
  const resolved = await resolveInstrumentInput({
    instrument: opts.instrument,
    underlying: opts.underlying,
    segment: opts.segment,
    instrumentType: opts.instrumentType,
    expiry: opts.expiry,
    strike: opts.strike,
    optionType: opts.optionType,
  });
  const instrument = resolved.instrument;

  // 1) Live quote (assertReady inside enforces enabled/configured/authed).
  const quote = await kite.getQuoteData(instrument);

  // Prefer the resolved instrument_token (correct for F&O), else the quote's.
  const token = resolved.instrumentToken ?? quote.instrumentToken;

  // 2) Historical candles (best-effort). If the token is missing or the call
  //    fails for a non-auth reason, fall back to quote-only OHLC.
  let candles: Candle[] | null = null;
  if (token != null) {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - historyWindowDays(interval) * 24 * 60 * 60 * 1000);
      const raw = await kite.getHistorical({
        instrumentToken: String(token),
        interval,
        from: fmt(from),
        to: fmt(to),
      });
      const parsed = parseCandles(raw);
      candles = parsed.length ? parsed : null;
    } catch (err) {
      // Re-throw auth errors so the user is told to log in; otherwise downgrade.
      if (err instanceof KiteError && err.code === "KITE_LOGIN_REQUIRED") throw err;
      candles = null;
    }
  }

  return buildLiveTradePlan({
    instrument,
    quote: {
      lastPrice: quote.lastPrice,
      open: quote.ohlc.open,
      high: quote.ohlc.high,
      low: quote.ohlc.low,
      previousClose: quote.ohlc.close,
      volume: quote.volume,
    },
    candles,
    riskProfile,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Resolve an instrument, fetch its live quote and (best-effort) candles.
 * Shared by the trade-plan and live-signal endpoints. Read-only.
 */
async function fetchMarketData(
  opts: { interval?: string } & ResolveQuery,
): Promise<{
  resolved: Awaited<ReturnType<typeof resolveInstrumentInput>>;
  quote: Awaited<ReturnType<typeof kite.getQuoteData>>;
  candles: Candle[] | null;
  interval: string;
}> {
  const interval = normaliseInterval(opts.interval);
  const resolved = await resolveInstrumentInput({
    instrument: opts.instrument,
    underlying: opts.underlying,
    segment: opts.segment,
    instrumentType: opts.instrumentType,
    expiry: opts.expiry,
    strike: opts.strike,
    optionType: opts.optionType,
  });
  const quote = await kite.getQuoteData(resolved.instrument);
  const token = resolved.instrumentToken ?? quote.instrumentToken;

  let candles: Candle[] | null = null;
  if (token != null) {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - historyWindowDays(interval) * 24 * 60 * 60 * 1000);
      const raw = await kite.getHistorical({
        instrumentToken: String(token),
        interval,
        from: fmt(from),
        to: fmt(to),
      });
      const parsed = parseCandles(raw);
      candles = parsed.length ? parsed : null;
    } catch (err) {
      if (err instanceof KiteError && err.code === "KITE_LOGIN_REQUIRED") throw err;
      candles = null;
    }
  }
  return { resolved, quote, candles, interval };
}

/**
 * Live Signal (Phase 3E): trend, bullish/bearish probability, estimated win %,
 * long & short setups with entry/SL/targets/exits, risk-reward and tentative
 * P/L per lot. Read-only — accepts exact instrument OR F&O resolver params.
 */
export async function getLiveSignal(
  opts: {
    interval?: string;
    riskProfile?: string;
    activeIndicators?: IndicatorId[];
    quantity?: number | null;
  } & ResolveQuery,
): Promise<LiveSignalResult & { resolvedInstrument: ResolvedInstrumentInfo }> {
  return (await getLiveSignalWithData(opts)).signal;
}

/**
 * Same as getLiveSignal but ALSO returns the fetched candles/quote/interval, so
 * callers (the decision loop) get the technical signal AND the raw candles in a
 * SINGLE Kite fetch — no duplicate historical call. Read-only.
 */
export async function getLiveSignalWithData(
  opts: {
    interval?: string;
    riskProfile?: string;
    activeIndicators?: IndicatorId[];
    quantity?: number | null;
  } & ResolveQuery,
): Promise<{
  signal: LiveSignalResult & { resolvedInstrument: ResolvedInstrumentInfo };
  candles: Candle[] | null;
  quote: Awaited<ReturnType<typeof kite.getQuoteData>>;
  interval: string;
}> {
  const riskProfile = normaliseRiskProfile(opts.riskProfile);
  const { resolved, quote, candles, interval } = await fetchMarketData(opts);

  const signal = buildLiveSignal({
    instrument: resolved.instrument,
    quote: {
      lastPrice: quote.lastPrice,
      open: quote.ohlc.open,
      high: quote.ohlc.high,
      low: quote.ohlc.low,
      previousClose: quote.ohlc.close,
      volume: quote.volume,
    },
    candles,
    riskProfile,
    lotSize: resolved.lotSize ?? null,
    quantity: opts.quantity ?? null,
    activeIndicators: opts.activeIndicators,
    timestamp: new Date().toISOString(),
  });

  const resolvedInstrument: ResolvedInstrumentInfo = {
    instrumentKey: resolved.instrument,
    instrumentToken: resolved.instrumentToken ?? quote.instrumentToken ?? 0,
    exchange: resolved.instrument.split(":")[0] ?? "",
    tradingsymbol: resolved.instrument.split(":")[1] ?? "",
    displayName: resolved.name ?? resolved.instrument,
    segment: "",
    instrumentType: resolved.instrumentType ?? "",
    lotSize: resolved.lotSize ?? 0,
    expiry: resolved.expiry ?? "",
    strike: resolved.strike ?? 0,
    optionType: ["CE", "PE"].includes(resolved.instrumentType ?? "") ? (resolved.instrumentType as string) : "",
  };

  return { signal: { ...signal, resolvedInstrument }, candles, quote, interval };
}

export interface ResolvedInstrumentInfo {
  instrumentKey: string;
  instrumentToken: number;
  exchange: string;
  tradingsymbol: string;
  displayName: string;
  segment: string;
  instrumentType: string;
  lotSize: number;
  expiry: string;
  strike: number;
  optionType: string;
}

/**
 * Chart data (Phase 3F): candles + overlay/oscillator series for active
 * indicators + CPR/pivot levels. Read-only.
 */
export async function getChartData(
  opts: { interval?: string; activeIndicators?: IndicatorId[] } & ResolveQuery,
): Promise<ReturnType<typeof buildChartData> & { instrument: string; interval: string; sessionOhlc: SessionOhlc }> {
  const active = opts.activeIndicators?.length ? opts.activeIndicators : undefined;
  const { resolved, quote, candles, interval } = await fetchMarketData(opts);
  if (!candles || candles.length === 0) {
    throw new KiteError(
      "No candle history available for this instrument/interval (chart needs candles). Try a different interval or ensure Kite is authorised.",
      503,
      "KITE_NO_CANDLES",
    );
  }
  // Previous-session H/L/C from daily candles (best-effort) for CPR/pivots.
  let prevDay: { high: number; low: number; close: number } | null = null;
  try {
    const token = resolved.instrumentToken;
    if (token != null) {
      const to = new Date();
      const from = new Date(to.getTime() - 10 * 24 * 60 * 60 * 1000);
      const raw = await kite.getHistorical({ instrumentToken: String(token), interval: "day", from: fmt(from), to: fmt(to) });
      const days = parseCandles(raw);
      if (days.length >= 2) {
        const d = days[days.length - 2];
        prevDay = { high: d.h, low: d.l, close: d.c };
      }
    }
  } catch {
    prevDay = null;
  }
  const chart = buildChartData(candles, active ?? DEFAULT_INDICATORS, prevDay, new Date().toISOString());
  // Current-session OHLC with correct, non-future, single-conversion event times.
  const sessionOhlc = computeSessionOhlc({
    candles,
    intervalMs: intervalToMs(interval),
    quote: { open: quote.ohlc.open, high: quote.ohlc.high, low: quote.ohlc.low, previousClose: quote.ohlc.close, lastPrice: quote.lastPrice },
    cmpMs: quote.exchangeTimeMs,
    nowMs: Date.now(),
  });
  return { ...chart, instrument: resolved.instrument, interval, sessionOhlc };
}

/**
 * Active Trade Monitor (Phase 3F): evaluate a manual position against the live
 * signal. Read-only — advisory only, never executes anything.
 */
export async function getActiveTradeMonitor(
  opts: {
    positionDirection: PositionDirection;
    entryPrice: number;
    quantity: number;
    interval?: string;
    riskProfile?: string;
    activeIndicators?: IndicatorId[];
  } & ResolveQuery,
): Promise<MonitorResult & { instrument: string }> {
  const signal = await getLiveSignal({
    instrument: opts.instrument,
    underlying: opts.underlying,
    segment: opts.segment,
    instrumentType: opts.instrumentType,
    expiry: opts.expiry,
    strike: opts.strike,
    optionType: opts.optionType,
    interval: opts.interval,
    riskProfile: opts.riskProfile,
    activeIndicators: opts.activeIndicators,
    quantity: opts.quantity,
  });
  const result = evaluatePosition({
    positionDirection: opts.positionDirection,
    entryPrice: opts.entryPrice,
    quantity: opts.quantity,
    signal,
  });
  return { ...result, instrument: signal.resolvedInstrument.instrumentKey };
}
