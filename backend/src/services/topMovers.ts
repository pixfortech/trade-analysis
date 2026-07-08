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
import { intelConfig } from "../config/intelligence.config";

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
  scanned: number; // instruments that returned a usable live quote
  total: number; // instruments in the bounded scan list
  message: string;
}

/** Human label for the bounded scan list per segment (it is not user-selected). */
function scanListLabel(segment: MoverSegment): string {
  switch (segment) {
    case "equity":
      return "curated large-cap instruments";
    case "indices":
      return "index instruments";
    case "futures":
      return "near-expiry futures";
    default:
      return "near-expiry option strikes";
  }
}

// Bounded scan list + hard cap come from intelConfig.movers (env-overridable:
// MOVERS_EQUITY_UNIVERSE, MOVERS_EQUITY_EXCHANGE, MOVERS_SCAN_LIMIT). Kept small
// to respect Kite rate limits.

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
    const exch = intelConfig.movers.equityExchange;
    return { keys: intelConfig.movers.equityUniverse.map((s) => ({ key: `${exch}:${s}`, name: s })), partial: true };
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
  const scanLimit = intelConfig.movers.scanLimit;
  const partial = pool.length > scanLimit || segment === "options" || segment === "futures";
  const keys = pool.slice(0, scanLimit).map((i) => ({ key: `${i.exchange}:${i.tradingsymbol}`, name: i.name || i.tradingsymbol }));
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
    return { segment, source: "kite", partialData: true, gainers: [], losers: [], timestamp, scanned: 0, total: 0, message: "No instruments available for this segment in the cache." };
  }

  const nameByKey = new Map(keys.map((k) => [k.key, k.name]));
  const data = await kite.getQuotes(keys.map((k) => k.key));

  const movers: Mover[] = [];
  for (const [key, q] of Object.entries(data)) {
    const m = buildMover(key, nameByKey.get(key) ?? key, q as Record<string, unknown>);
    if (m) movers.push(m);
  }
  // Gainers: most positive first. Losers: most negative first. Losers are NOT
  // hidden when few — only empty when the scanned set has no negative movers.
  const sorted = [...movers].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter((m) => m.changePercent > 0).slice(0, 10);
  const losers = sorted.filter((m) => m.changePercent < 0).reverse().slice(0, 10);

  const scanned = movers.length;
  const total = keys.length;
  const universe = segment === "equity" ? `${intelConfig.movers.equityExchange} equity` : `${segment}`;
  return {
    segment,
    source: "kite",
    partialData: partial || scanned < total,
    gainers,
    losers,
    timestamp,
    scanned,
    total,
    message: `Limited scan: ${scanned} of ${total} ${scanListLabel(segment)} scanned to respect Kite rate limits. This is not the full ${universe} universe.`,
  };
}
