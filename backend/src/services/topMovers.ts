// =====================================================================
// Top Movers — READ-ONLY (Phase 3G)
// ---------------------------------------------------------------------
// Computes top gainers/losers from a bounded set of instruments using the
// batch-quote endpoint. To respect Kite rate limits we DO NOT scan the whole
// universe: equities use a curated large-cap list; indices/futures/options use
// a capped slice from the instruments cache. Sets partialData=true when the
// set is limited. Read-only — no order/execution logic.
// =====================================================================

import * as kite from "./kite.service";
import * as instruments from "./instruments.service";
import type { Instrument } from "./instruments.service";

export type MoverSegment = "equity" | "indices" | "futures" | "options";

export interface Mover {
  instrument: string;
  displayName: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
}

export interface TopMoversResult {
  segment: MoverSegment;
  source: "kite";
  partialData: boolean;
  gainers: Mover[];
  losers: Mover[];
  timestamp: string;
  message: string;
}

// Curated NSE large caps (kept small to respect rate limits).
const CURATED_EQUITY = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC",
  "LT", "KOTAKBANK", "AXISBANK", "HINDUNILVR", "BAJFINANCE", "MARUTI", "SUNPHARMA",
  "TATAMOTORS", "WIPRO", "ULTRACEMCO", "TITAN", "ADANIENT", "POWERGRID", "NTPC",
  "TATASTEEL", "JSWSTEEL", "M&M",
];

const MAX_INSTRUMENTS = 40; // hard cap per request

function buildMover(instrumentKey: string, displayName: string, q: Record<string, unknown>): Mover | null {
  const ltp = typeof q.last_price === "number" ? q.last_price : 0;
  const ohlc = (q.ohlc as Record<string, unknown>) ?? {};
  const close = typeof ohlc.close === "number" ? ohlc.close : 0;
  if (ltp <= 0 || close <= 0) return null;
  const change = Math.round((ltp - close) * 100) / 100;
  const changePercent = Math.round(((ltp - close) / close) * 10000) / 100;
  const volume = typeof q.volume === "number" ? q.volume : 0;
  return { instrument: instrumentKey, displayName, ltp, change, changePercent, volume };
}

/** Pick the instrument keys to quote for a segment (bounded). */
async function pickInstruments(segment: MoverSegment): Promise<{ keys: { key: string; name: string }[]; partial: boolean }> {
  if (segment === "equity") {
    return { keys: CURATED_EQUITY.map((s) => ({ key: `NSE:${s}`, name: s })), partial: true };
  }
  await instruments.ensureLoaded();
  const all = instruments.allInstruments();
  let pool: Instrument[];
  if (segment === "indices") {
    pool = all.filter((i) => i.exchange.toUpperCase() === "INDICES" || i.segment.toUpperCase() === "INDICES");
  } else if (segment === "futures") {
    pool = nearestExpiry(all.filter((i) => i.instrumentType.toUpperCase() === "FUT" && i.exchange.toUpperCase() === "NFO"));
  } else {
    pool = nearestExpiry(all.filter((i) => ["CE", "PE"].includes(i.instrumentType.toUpperCase()) && i.exchange.toUpperCase() === "NFO"));
  }
  const partial = pool.length > MAX_INSTRUMENTS || segment === "options" || segment === "futures";
  const keys = pool.slice(0, MAX_INSTRUMENTS).map((i) => ({ key: `${i.exchange}:${i.tradingsymbol}`, name: i.name || i.tradingsymbol }));
  return { keys, partial };
}

/** Keep only contracts of the single nearest expiry (limits option blow-up). */
function nearestExpiry(list: Instrument[]): Instrument[] {
  const withExp = list.filter((i) => i.expiry);
  if (withExp.length === 0) return list;
  const future = withExp.map((i) => i.expiry).filter((e) => Date.parse(e) >= Date.now() - 86_400_000).sort();
  const nearest = future[0];
  return nearest ? withExp.filter((i) => i.expiry === nearest) : withExp;
}

export async function getTopMovers(segment: MoverSegment): Promise<TopMoversResult> {
  const { keys, partial } = await pickInstruments(segment);
  const timestamp = new Date().toISOString();
  if (keys.length === 0) {
    return { segment, source: "kite", partialData: true, gainers: [], losers: [], timestamp, message: "No instruments available for this segment in the cache." };
  }

  const nameByKey = new Map(keys.map((k) => [k.key, k.name]));
  const data = await kite.getQuotes(keys.map((k) => k.key));

  const movers: Mover[] = [];
  for (const [key, q] of Object.entries(data)) {
    const m = buildMover(key, nameByKey.get(key) ?? key, q as Record<string, unknown>);
    if (m) movers.push(m);
  }
  const sorted = [...movers].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter((m) => m.changePercent > 0).slice(0, 10);
  const losers = sorted.filter((m) => m.changePercent < 0).reverse().slice(0, 10);

  return {
    segment,
    source: "kite",
    partialData: partial || movers.length < keys.length,
    gainers,
    losers,
    timestamp,
    message: partial
      ? `Showing a bounded set (${movers.length}/${keys.length}) to respect Kite rate limits — not the full ${segment} universe.`
      : "",
  };
}
