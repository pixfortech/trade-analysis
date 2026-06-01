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
export async function getLiveTradePlan(opts: {
  instrument: string;
  interval?: string;
  riskProfile?: string;
}): Promise<LiveTradePlanResult> {
  const instrument = (opts.instrument ?? "").trim();
  if (!instrument || !instrument.includes(":")) {
    throw new KiteError('Invalid instrument. Use EXCHANGE:TRADINGSYMBOL, e.g. "NSE:RELIANCE".', 400, "KITE_BAD_INSTRUMENT");
  }
  const interval = normaliseInterval(opts.interval);
  const riskProfile = normaliseRiskProfile(opts.riskProfile);

  // 1) Live quote (assertReady inside enforces enabled/configured/authed).
  const quote = await kite.getQuoteData(instrument);

  // 2) Historical candles (best-effort). If the token is missing or the call
  //    fails for a non-auth reason, fall back to quote-only OHLC.
  let candles: Candle[] | null = null;
  if (quote.instrumentToken != null) {
    try {
      const to = new Date();
      const from = new Date(to.getTime() - historyWindowDays(interval) * 24 * 60 * 60 * 1000);
      const raw = await kite.getHistorical({
        instrumentToken: String(quote.instrumentToken),
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
