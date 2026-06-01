// =====================================================================
// Kite Instruments — master cache, search & F&O resolver (Phase 3C)
// ---------------------------------------------------------------------
// Downloads the Kite instruments dump (CSV), caches it in memory, and resolves
// user-friendly inputs (underlying + expiry [+ strike + CE/PE]) into the EXACT
// `exchange:tradingsymbol` and `instrument_token` required by Kite.
//
// READ-ONLY: this never places/modifies/cancels orders. Parsing & matching are
// pure functions (no network) so they are easy to unit-test. The cache only
// ever contains the live instruments dump (live contracts), never guessed
// symbols. No secrets are stored or returned here.
// =====================================================================

import * as kite from "./kite.service";
import { KiteError } from "./kite.service";

export interface Instrument {
  instrumentToken: number;
  exchangeToken: number;
  tradingsymbol: string;
  name: string;
  lastPrice: number;
  expiry: string; // "" for cash, else YYYY-MM-DD
  strike: number;
  tickSize: number;
  lotSize: number;
  instrumentType: string; // EQ | FUT | CE | PE
  segment: string; // e.g. NFO-FUT, NFO-OPT, NSE
  exchange: string; // NSE | NFO | BSE | …
}

interface CacheState {
  instruments: Instrument[];
  byKey: Map<string, Instrument>; // "EXCHANGE:TRADINGSYMBOL" -> instrument
  byToken: Map<number, Instrument>;
  loadedAt: string | null;
  source: "kite" | null;
}

const cache: CacheState = {
  instruments: [],
  byKey: new Map(),
  byToken: new Map(),
  loadedAt: null,
  source: null,
};

// --------------------------- CSV parsing (pure) ---------------------------

/** Minimal CSV line splitter that respects double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Parse the Kite instruments CSV. Header (Kite v3):
 * instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,
 * strike,tick_size,lot_size,instrument_type,segment,exchange
 */
export function parseInstrumentsCsv(csv: string): Instrument[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iToken = idx("instrument_token");
  const iExToken = idx("exchange_token");
  const iSym = idx("tradingsymbol");
  const iName = idx("name");
  const iLast = idx("last_price");
  const iExp = idx("expiry");
  const iStrike = idx("strike");
  const iTick = idx("tick_size");
  const iLot = idx("lot_size");
  const iType = idx("instrument_type");
  const iSeg = idx("segment");
  const iExch = idx("exchange");
  if (iSym < 0 || iToken < 0 || iExch < 0) return []; // unexpected header

  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const out: Instrument[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    if (f.length < header.length) continue;
    const tradingsymbol = (f[iSym] ?? "").trim();
    if (!tradingsymbol) continue;
    out.push({
      instrumentToken: num(f[iToken]),
      exchangeToken: iExToken >= 0 ? num(f[iExToken]) : 0,
      tradingsymbol,
      name: (f[iName] ?? "").trim(),
      lastPrice: iLast >= 0 ? num(f[iLast]) : 0,
      expiry: iExp >= 0 ? (f[iExp] ?? "").trim() : "",
      strike: iStrike >= 0 ? num(f[iStrike]) : 0,
      tickSize: iTick >= 0 ? num(f[iTick]) : 0,
      lotSize: iLot >= 0 ? num(f[iLot]) : 0,
      instrumentType: iType >= 0 ? (f[iType] ?? "").trim() : "",
      segment: iSeg >= 0 ? (f[iSeg] ?? "").trim() : "",
      exchange: (f[iExch] ?? "").trim(),
    });
  }
  return out;
}

// --------------------------- cache management ---------------------------

export function setCache(instruments: Instrument[], source: "kite" = "kite"): void {
  cache.instruments = instruments;
  cache.byKey = new Map();
  cache.byToken = new Map();
  for (const ins of instruments) {
    cache.byKey.set(`${ins.exchange}:${ins.tradingsymbol}`, ins);
    cache.byToken.set(ins.instrumentToken, ins);
  }
  cache.loadedAt = new Date().toISOString();
  cache.source = source;
}

export function getCacheStatus() {
  // By-exchange counts help the UI without exposing anything sensitive.
  const byExchange: Record<string, number> = {};
  for (const ins of cache.instruments) byExchange[ins.exchange] = (byExchange[ins.exchange] ?? 0) + 1;
  return {
    loaded: cache.loadedAt != null,
    count: cache.instruments.length,
    loadedAt: cache.loadedAt,
    source: cache.source,
    byExchange,
    readOnly: true as const,
  };
}

export function isLoaded(): boolean {
  return cache.instruments.length > 0;
}

/** Download + parse + cache the instruments dump. Returns the new count. */
export async function refreshCache(segment?: string): Promise<number> {
  const csv = await kite.getInstrumentsCsv(segment);
  const parsed = parseInstrumentsCsv(csv);
  if (parsed.length === 0) {
    throw new KiteError("Instruments dump was empty or unparseable.", 502, "KITE_INSTRUMENTS_EMPTY");
  }
  setCache(parsed, "kite");
  return parsed.length;
}

/** Ensure the cache is populated, loading it on first use. */
export async function ensureLoaded(): Promise<void> {
  if (!isLoaded()) await refreshCache();
}

export function lookupByKey(exchangeSymbol: string): Instrument | undefined {
  return cache.byKey.get(exchangeSymbol);
}

export function lookupByToken(token: number): Instrument | undefined {
  return cache.byToken.get(token);
}

// --------------------------- search & resolve (pure over a list) ---------------------------

export interface SearchFilters {
  q?: string;
  segment?: string; // exchange filter, e.g. NFO / NSE
  instrumentType?: string; // FUT | CE | PE | EQ
  underlying?: string; // matches `name`
  limit?: number;
}

/** Case-insensitive search over an instrument list. Pure. */
export function searchInstruments(list: Instrument[], filters: SearchFilters): Instrument[] {
  const q = (filters.q ?? "").trim().toUpperCase();
  const seg = (filters.segment ?? "").trim().toUpperCase();
  const type = (filters.instrumentType ?? "").trim().toUpperCase();
  const underlying = (filters.underlying ?? "").trim().toUpperCase();
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;

  const res = list.filter((ins) => {
    if (seg && ins.exchange.toUpperCase() !== seg) return false;
    if (type && ins.instrumentType.toUpperCase() !== type) return false;
    if (underlying && ins.name.toUpperCase() !== underlying) return false;
    if (q) {
      const hay = `${ins.tradingsymbol} ${ins.name}`.toUpperCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort: nearest expiry first, then strike, then symbol.
  res.sort((a, b) => {
    if (a.expiry !== b.expiry) return a.expiry.localeCompare(b.expiry);
    if (a.strike !== b.strike) return a.strike - b.strike;
    return a.tradingsymbol.localeCompare(b.tradingsymbol);
  });
  return res.slice(0, limit);
}

export interface ResolveParams {
  underlying: string;
  segment?: string; // default NFO for F&O
  instrumentType: string; // FUT | CE | PE | EQ
  expiry?: string; // YYYY-MM-DD or YYYY-MM (month) — optional → nearest
  strike?: number; // options only
  optionType?: string; // CE | PE (alias for instrumentType on options)
}

export interface ResolveResult {
  resolved: Instrument | null;
  candidates: Instrument[];
  message: string;
}

/**
 * Resolve user-friendly F&O inputs to an exact instrument. Pure over `list`.
 *  - Futures: underlying + instrumentType=FUT (+ optional expiry → nearest).
 *  - Options: underlying + CE/PE + strike (+ optional expiry → nearest).
 * Never guesses: returns the exact match, or sorted candidates + guidance.
 */
export function resolveInstrument(list: Instrument[], params: ResolveParams): ResolveResult {
  const underlying = (params.underlying ?? "").trim().toUpperCase();
  const segment = (params.segment ?? "NFO").trim().toUpperCase();
  let type = (params.instrumentType ?? "").trim().toUpperCase();
  // optionType is an alias for CE/PE.
  if (params.optionType) type = params.optionType.trim().toUpperCase();

  if (!underlying) {
    return { resolved: null, candidates: [], message: "Provide an `underlying` (e.g. MIDCPNIFTY, NIFTY, RELIANCE)." };
  }
  if (!type) {
    return { resolved: null, candidates: [], message: "Provide `instrumentType` (FUT, CE or PE) — or `optionType` for options." };
  }

  // Equity shortcut.
  if (type === "EQ") {
    const eq = list.filter(
      (i) => i.instrumentType === "EQ" && i.tradingsymbol.toUpperCase() === underlying && i.exchange.toUpperCase() === (params.segment ? segment : "NSE"),
    );
    if (eq.length === 1) return { resolved: eq[0], candidates: eq, message: "Resolved equity instrument." };
    return {
      resolved: null,
      candidates: eq,
      message: eq.length ? "Multiple equity matches; pick one." : `No equity match for ${underlying}.`,
    };
  }

  const isOption = type === "CE" || type === "PE";

  let matches = list.filter(
    (i) =>
      i.exchange.toUpperCase() === segment &&
      i.instrumentType.toUpperCase() === type &&
      i.name.toUpperCase() === underlying,
  );

  if (matches.length === 0) {
    return {
      resolved: null,
      candidates: [],
      message: `No ${type} contracts found for underlying "${underlying}" on ${segment}. Check the underlying name and that the instruments cache is loaded.`,
    };
  }

  // Expiry filter (exact YYYY-MM-DD, or YYYY-MM month prefix).
  const expiry = (params.expiry ?? "").trim();
  if (expiry) {
    const byExp = matches.filter((i) => i.expiry === expiry || i.expiry.startsWith(expiry));
    if (byExp.length) matches = byExp;
    else {
      return {
        resolved: null,
        candidates: sortContracts(matches).slice(0, 20),
        message: `No ${underlying} ${type} for expiry "${expiry}". See candidate expiries below.`,
      };
    }
  }

  // Options need a strike.
  if (isOption) {
    if (params.strike == null || !Number.isFinite(params.strike)) {
      return {
        resolved: null,
        candidates: sortContracts(matches).slice(0, 30),
        message: `Provide a numeric \`strike\` for ${underlying} ${type}. See nearby strikes below.`,
      };
    }
    const byStrike = matches.filter((i) => i.strike === params.strike);
    if (byStrike.length === 0) {
      // Suggest nearest strikes for the chosen (or nearest) expiry.
      const near = sortContracts(matches)
        .sort((a, b) => Math.abs(a.strike - params.strike!) - Math.abs(b.strike - params.strike!))
        .slice(0, 10);
      return {
        resolved: null,
        candidates: near,
        message: `No ${underlying} ${type} at strike ${params.strike}. Nearest available strikes are listed.`,
      };
    }
    matches = byStrike;
  }

  // If no expiry was given, prefer the nearest upcoming expiry.
  if (!expiry) {
    const sorted = sortContracts(matches);
    const nearestExpiry = sorted[0]?.expiry;
    const sameExpiry = sorted.filter((i) => i.expiry === nearestExpiry);
    if (sameExpiry.length === 1) {
      return { resolved: sameExpiry[0], candidates: sameExpiry, message: "Resolved to the nearest expiry." };
    }
    return {
      resolved: null,
      candidates: sorted.slice(0, 20),
      message: "Multiple contracts match; specify `expiry` (and `strike` for options) to resolve exactly.",
    };
  }

  if (matches.length === 1) {
    return { resolved: matches[0], candidates: matches, message: "Resolved exact contract." };
  }
  return {
    resolved: null,
    candidates: sortContracts(matches).slice(0, 20),
    message: "Multiple contracts match; refine `expiry`/`strike` to resolve exactly.",
  };
}

function sortContracts(list: Instrument[]): Instrument[] {
  return [...list].sort((a, b) => {
    if (a.expiry !== b.expiry) return a.expiry.localeCompare(b.expiry);
    if (a.strike !== b.strike) return a.strike - b.strike;
    return a.tradingsymbol.localeCompare(b.tradingsymbol);
  });
}

// --------------------------- cache-backed wrappers ---------------------------

export async function search(filters: SearchFilters): Promise<Instrument[]> {
  await ensureLoaded();
  return searchInstruments(cache.instruments, filters);
}

export async function resolve(params: ResolveParams): Promise<ResolveResult> {
  await ensureLoaded();
  return resolveInstrument(cache.instruments, params);
}

/** Expose the raw cached list (used by tests / advanced callers). */
export function allInstruments(): Instrument[] {
  return cache.instruments;
}

/** Reset the cache (used by tests). */
export function _resetCache(): void {
  setCache([]);
  cache.loadedAt = null;
  cache.source = null;
}
