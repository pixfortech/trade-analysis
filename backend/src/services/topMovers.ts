// =====================================================================
// Top Movers — READ-ONLY. Real Kite-backed quotes over a bounded instrument set
// with FULL contract identity (options keep expiry/strike/CE-PE — never just the
// underlying), config-driven LIQUIDITY FILTERS applied before sorting (so
// low-premium illiquid options can't dominate), and transparent scanned/passed
// counts. No static/fabricated movers. Read-only — no order/execution logic.
// =====================================================================

import * as kite from "./kite.service";
import * as instruments from "./instruments.service";
import type { Instrument } from "./instruments.service";
import { contractIdentity, extractQuote, type ContractIdentity } from "./contractIdentity";
import { intelConfig } from "../config/intelligence.config";

export type MoverSegment = "equity" | "indices" | "futures" | "options";
export type MoverSort = "percent" | "absolute" | "volume" | "oi";
export type Freshness = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";

export interface Mover extends ContractIdentity {
  ltp: number;
  change: number;
  changePercent: number;
  prevClose: number;
  volume: number;
  oi: number | null;
  bid: number | null;
  ask: number | null;
  spreadPct: number | null;
  exchangeTimeMs: number | null;
  freshness: Freshness;
}

export interface TopMoversResult {
  segment: MoverSegment;
  source: "kite";
  partialData: boolean;
  sort: MoverSort;
  gainers: Mover[];
  losers: Mover[];
  timestamp: string;
  scanned: number; // instruments that returned a usable live quote
  passed: number; // survived the liquidity/quality filters
  total: number; // instruments in the bounded scan list
  filters: string[]; // human summary of the active filters
  message: string;
}

const TZ = intelConfig.session.timezone;

function scanListLabel(segment: MoverSegment): string {
  switch (segment) {
    case "equity": return "large-cap equities";
    case "indices": return "index instruments";
    case "futures": return "near-expiry futures";
    default: return `near-ATM options (${intelConfig.movers.options.underlyings.join("/")})`;
  }
}

function freshnessOf(exchangeTimeMs: number | null, now: number, maxAgeSec: number): Freshness {
  if (exchangeTimeMs == null) return "UNAVAILABLE";
  const age = (now - exchangeTimeMs) / 1000;
  if (maxAgeSec > 0 && age > maxAgeSec) return "STALE";
  if (age > 60) return "DELAYED";
  return "LIVE";
}

/** Keep only contracts of the single nearest (non-expired) expiry. */
function nearestExpiry(list: Instrument[]): Instrument[] {
  const withExp = list.filter((i) => i.expiry);
  if (withExp.length === 0) return list;
  const future = withExp.map((i) => i.expiry).filter((e) => Date.parse(e) >= Date.now() - 86_400_000).sort();
  const nearest = future[0];
  return nearest ? withExp.filter((i) => i.expiry === nearest) : [];
}

/** Bounded, near-middle (≈ATM) option strikes per configured underlying. */
function pickOptions(all: Instrument[]): Instrument[] {
  const cfg = intelConfig.movers;
  const per = Math.max(2, Math.floor(cfg.scanLimit / Math.max(1, cfg.options.underlyings.length * 2)));
  const out: Instrument[] = [];
  for (const u of cfg.options.underlyings) {
    const opts = nearestExpiry(all.filter((i) => ["CE", "PE"].includes(i.instrumentType.toUpperCase()) && i.exchange.toUpperCase() === "NFO" && (i.name || "").toUpperCase() === u));
    if (opts.length === 0) continue;
    const strikes = [...new Set(opts.map((o) => o.strike))].sort((a, b) => a - b);
    const mid = Math.floor(strikes.length / 2);
    const pick = new Set(strikes.slice(Math.max(0, mid - per), mid + per));
    for (const o of opts) if (pick.has(o.strike)) out.push(o);
  }
  return out.slice(0, cfg.scanLimit);
}

/** Resolve the bounded instrument SET (full metadata) to quote for a segment. */
async function pickInstruments(segment: MoverSegment): Promise<{ list: Instrument[]; partial: boolean }> {
  await instruments.ensureLoaded().catch(() => {});
  const all = instruments.isLoaded() ? instruments.allInstruments() : [];
  if (segment === "equity") {
    const exch = intelConfig.movers.equityExchange;
    const list = intelConfig.movers.equityUniverse.map((s) => instruments.lookupByKey(`${exch}:${s}`) ?? minimalEquity(exch, s));
    return { list, partial: true };
  }
  if (segment === "indices") {
    return { list: all.filter((i) => i.exchange.toUpperCase() === "INDICES" || i.segment.toUpperCase() === "INDICES").slice(0, intelConfig.movers.scanLimit), partial: false };
  }
  if (segment === "futures") {
    const futs = nearestExpiry(all.filter((i) => i.instrumentType.toUpperCase() === "FUT" && i.exchange.toUpperCase() === "NFO"));
    return { list: futs.slice(0, intelConfig.movers.scanLimit), partial: futs.length > intelConfig.movers.scanLimit };
  }
  const opts = pickOptions(all);
  return { list: opts, partial: true };
}

function minimalEquity(exchange: string, symbol: string): Instrument {
  return { instrumentToken: 0, exchangeToken: 0, tradingsymbol: symbol, name: symbol, lastPrice: 0, expiry: "", strike: 0, tickSize: 0, lotSize: 0, instrumentType: "EQ", segment: exchange, exchange };
}

/** Filter config for a segment (options are tighter). */
function filtersFor(segment: MoverSegment) {
  const m = intelConfig.movers;
  if (segment === "options") return { minLtp: m.options.minLtp, minVolume: m.options.minVolume, minOi: m.options.minOi, maxSpreadPct: m.options.maxSpreadPct, maxQuoteAgeSec: m.maxQuoteAgeSec };
  return { minLtp: m.minLtp, minVolume: m.minVolume, minOi: m.minOi, maxSpreadPct: m.maxSpreadPct, maxQuoteAgeSec: m.maxQuoteAgeSec };
}

function sortKey(m: Mover, field: MoverSort): number {
  return field === "absolute" ? m.change : field === "volume" ? m.volume : field === "oi" ? m.oi ?? 0 : m.changePercent;
}

export async function getTopMovers(segment: MoverSegment, opts?: { sort?: MoverSort }): Promise<TopMoversResult> {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const sort: MoverSort = opts?.sort ?? (segment === "options" ? intelConfig.movers.options.sortField : "percent");
  const { list, partial } = await pickInstruments(segment);
  const f = filtersFor(segment);
  const filterSummary = [
    f.minLtp > 0 ? `LTP ≥ ${f.minLtp}` : null,
    f.minVolume > 0 ? `vol ≥ ${f.minVolume}` : null,
    f.minOi > 0 ? `OI ≥ ${f.minOi}` : null,
    f.maxSpreadPct < 100 ? `spread ≤ ${f.maxSpreadPct}%` : null,
    f.maxQuoteAgeSec > 0 ? `age ≤ ${f.maxQuoteAgeSec}s` : null,
    intelConfig.movers.excludeNearZeroPrevClose ? "valid prev-close" : null,
  ].filter((x): x is string => !!x);

  if (list.length === 0) {
    return { segment, source: "kite", partialData: true, sort, gainers: [], losers: [], timestamp, scanned: 0, passed: 0, total: 0, filters: filterSummary, message: "No instruments available for this segment (instruments cache may need a refresh)." };
  }

  const byKey = new Map(list.map((i) => [`${i.exchange}:${i.tradingsymbol}`, i]));
  // Batched quote retrieval (rate-limit-safe) — chunk the key set.
  const keys = [...byKey.keys()];
  const batch = intelConfig.optionsChain.quoteBatchSize;
  const data: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i += batch) {
    const part = await kite.getQuotes(keys.slice(i, i + batch));
    Object.assign(data, part);
  }

  const seen = new Set<number>();
  const movers: Mover[] = [];
  let scanned = 0;
  for (const [key, raw] of Object.entries(data)) {
    const inst = byKey.get(key);
    if (!inst) continue;
    const q = raw as Record<string, unknown>;
    const qf = extractQuote(q, TZ);
    if (qf.ltp <= 0 || qf.prevClose <= 0) continue; // no usable quote
    scanned++;
    // Dedupe by instrument token (never by display name).
    if (inst.instrumentToken > 0) { if (seen.has(inst.instrumentToken)) continue; seen.add(inst.instrumentToken); }
    // Liquidity / quality filters (config-driven).
    if (intelConfig.movers.excludeNearZeroPrevClose && qf.prevClose <= intelConfig.movers.nearZeroPrevClose) continue;
    if (f.minLtp > 0 && qf.ltp < f.minLtp) continue;
    if (f.minVolume > 0 && qf.volume < f.minVolume) continue;
    if (f.minOi > 0 && (qf.oi ?? 0) < f.minOi) continue;
    if (f.maxSpreadPct < 100 && qf.spreadPct != null && qf.spreadPct > f.maxSpreadPct) continue;
    const freshness = freshnessOf(qf.exchangeTimeMs, now, f.maxQuoteAgeSec);
    if (f.maxQuoteAgeSec > 0 && freshness === "STALE") continue;
    movers.push({ ...contractIdentity(inst), ...qf, freshness });
  }

  const limit = intelConfig.movers.resultsLimit;
  const gainers = movers.filter((m) => m.changePercent > 0).sort((a, b) => sortKey(b, sort) - sortKey(a, sort)).slice(0, limit);
  const losers = movers.filter((m) => m.changePercent < 0).sort((a, b) => sortKey(a, sort) - sortKey(b, sort)).slice(0, limit);

  return {
    segment,
    source: "kite",
    partialData: partial || scanned < list.length,
    sort,
    gainers,
    losers,
    timestamp,
    scanned,
    passed: movers.length,
    total: list.length,
    filters: filterSummary,
    message: `Live scan · ${list.length} ${scanListLabel(segment)} checked · ${movers.length} passed liquidity filters · ${scanned} quoted.`,
  };
}
