// =====================================================================
// Current-session OHLC + event timestamps (READ-ONLY, pure). Fixes the wrong /
// future / double-converted OHLC times: high/low are scanned ONLY within the
// CURRENT trading session (the market-TZ date of the latest candle), every event
// time is returned as EPOCH MILLISECONDS (an unambiguous instant — the frontend
// converts to Asia/Kolkata exactly once), and any time in the future relative to
// `nowMs` is dropped (never fabricated). Precision is labelled so the UI can say
// "candle" vs "tick" vs "receipt". Session timezone comes from central config.
// =====================================================================

import { intelConfig } from "../config/intelligence.config";
import { round2, type Candle } from "./technicalAnalysis";

export type EventPrecision = "tick" | "candle" | "session" | "receipt" | "none";
export interface OhlcEvent {
  value: number | null;
  ms: number | null; // epoch milliseconds (UTC instant); null = unknown/unavailable
  precision: EventPrecision;
}
export interface SessionOhlc {
  timezone: string;
  sessionDate: string | null; // YYYY-MM-DD in the market timezone
  intervalMs: number; // candle interval (ms) — for "in the HH:MM candle" labelling
  prevClose: OhlcEvent;
  open: OhlcEvent;
  high: OhlcEvent;
  low: OhlcEvent;
  cmp: OhlcEvent;
}

const SKEW_MS = 60_000; // tolerate up to 1 min of server/exchange clock skew

/** Calendar date (YYYY-MM-DD) of an instant in the given IANA timezone. */
export function tzDateKey(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Parse a source timestamp → epoch ms. Handles ISO-with-offset and epoch (s/ms). */
export function parseInstant(t: string | number | null | undefined): number | null {
  if (t == null) return null;
  if (typeof t === "number") return Number.isFinite(t) ? (t < 1e12 ? t * 1000 : t) : null;
  const n = Date.parse(t);
  return Number.isNaN(n) ? null : n;
}

/** Never return a future instant (guards against wrong-session / bad data). */
function notFuture(ms: number | null, nowMs: number): number | null {
  return ms != null && ms <= nowMs + SKEW_MS ? ms : null;
}
const numOrNull = (v: number): number | null => (Number.isFinite(v) && v > 0 ? round2(v) : null);

export function computeSessionOhlc(input: {
  candles: Candle[] | null;
  intervalMs: number;
  quote: { open: number; high: number; low: number; previousClose: number; lastPrice: number };
  cmpMs: number | null; // exchange / last-trade time if captured, else null
  nowMs: number;
}): SessionOhlc {
  const tz = intelConfig.session.timezone;
  const all = input.candles ?? [];

  // Current session = the market-TZ date of the latest (non-future) candle.
  let sessionDate: string | null = null;
  let session: Candle[] = [];
  if (all.length) {
    // Walk back to the last candle that isn't in the future.
    let lastMs: number | null = null;
    for (let i = all.length - 1; i >= 0; i--) {
      const ms = notFuture(parseInstant(all[i].t), input.nowMs);
      if (ms != null) { lastMs = ms; break; }
    }
    if (lastMs != null) {
      sessionDate = tzDateKey(lastMs, tz);
      session = all.filter((c) => {
        const ms = notFuture(parseInstant(c.t), input.nowMs);
        return ms != null && tzDateKey(ms, tz) === sessionDate;
      });
    }
  }

  const openC = session[0] ?? null;
  const open: OhlcEvent = openC ? { value: numOrNull(openC.o), ms: notFuture(parseInstant(openC.t), input.nowMs), precision: "candle" } : { value: numOrNull(input.quote.open), ms: null, precision: "none" };

  let hi = -Infinity, lo = Infinity, hiMs: number | null = null, loMs: number | null = null;
  for (const c of session) {
    if (c.h > hi) { hi = c.h; hiMs = parseInstant(c.t); }
    if (c.l < lo) { lo = c.l; loMs = parseInstant(c.t); }
  }
  const high: OhlcEvent = session.length ? { value: numOrNull(hi), ms: notFuture(hiMs, input.nowMs), precision: "candle" } : { value: numOrNull(input.quote.high), ms: null, precision: "none" };
  const low: OhlcEvent = session.length ? { value: numOrNull(lo), ms: notFuture(loMs, input.nowMs), precision: "candle" } : { value: numOrNull(input.quote.low), ms: null, precision: "none" };

  return {
    timezone: tz,
    sessionDate,
    intervalMs: input.intervalMs,
    prevClose: { value: numOrNull(input.quote.previousClose), ms: null, precision: "session" },
    open,
    high,
    low,
    cmp: { value: numOrNull(input.quote.lastPrice), ms: notFuture(input.cmpMs, input.nowMs), precision: input.cmpMs != null ? "tick" : "receipt" },
  };
}

/** Offset (ms) of a timezone at a given instant — DST-aware, no hardcoded value. */
export function tzOffsetMs(ms: number, timezone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const p = dtf.formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return asUtc - ms;
}

/**
 * Interpret an offset-less wall-clock string (e.g. Kite's "2024-06-13 15:29:59")
 * as being in `timezone`, returning epoch ms. Converts EXACTLY ONCE (no double
 * IST conversion). Returns null if unparseable.
 */
export function wallClockToMs(s: string, timezone: string): number | null {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const guessUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return guessUtc - tzOffsetMs(guessUtc, timezone);
}

/** Candle interval string → milliseconds. */
export function intervalToMs(interval: string): number {
  if (interval === "day") return 24 * 60 * 60 * 1000;
  const n = parseInt(interval, 10);
  if (interval.includes("hour")) return (Number.isFinite(n) ? n : 1) * 3_600_000;
  if (interval.includes("minute")) return (Number.isFinite(n) ? n : 1) * 60_000;
  return 5 * 60_000;
}
