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
  opts: { interval?: string; riskProfile?: string } & ResolveQuery,
): Promise<LiveSignalResult & { resolvedInstrument: ResolvedInstrumentInfo }> {
  const riskProfile = normaliseRiskProfile(opts.riskProfile);
  const { resolved, quote, candles } = await fetchMarketData(opts);

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

  return { ...signal, resolvedInstrument };
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
