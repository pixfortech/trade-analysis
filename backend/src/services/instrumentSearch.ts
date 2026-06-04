// =====================================================================
// Instrument classification + Zerodha-like grouped search (Phase 3D)
// ---------------------------------------------------------------------
// Pure helpers (no network, no globals) over an Instrument[]. Used to:
//   • classify each instrument into a UI segment (equity/index/futures/options)
//   • build a friendly displayName
//   • parse free-text queries like "NIFTY 24500 CE" or "RELIANCE FUT"
//   • rank + group results Zerodha-style.
// READ-ONLY analysis helpers only — no order/execution logic.
// =====================================================================

import type { Instrument } from "./instruments.service";

// Exchanges Kite Connect can quote/serve for retail. Anything else (e.g. NSEIX /
// GIFT NIFTY, or other special segments) is excluded from search so the app
// never hands a backend endpoint an unquotable EXCHANGE:SYMBOL key.
const SUPPORTED_EXCHANGES = new Set(["NSE", "BSE", "NFO", "BFO", "CDS", "BCD", "MCX", "INDICES"]);

/** True if an instrument's exchange is one Kite can actually quote/serve. */
export function isSupportedExchange(exchange: string): boolean {
  return SUPPORTED_EXCHANGES.has((exchange || "").toUpperCase());
}

export type UiSegment = "equity" | "indices" | "futures" | "options";
export type UiInstrumentType = "EQ" | "INDEX" | "FUT" | "CE" | "PE";

export interface InstrumentResult {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  instrumentToken: number;
  exchange: string;
  tradingsymbol: string;
  name: string;
  displayName: string;
  segment: string; // raw Kite segment
  uiSegment: UiSegment;
  instrumentType: UiInstrumentType;
  expiry: string;
  strike: number;
  optionType: string; // CE | PE | ""
  lotSize: number;
  tickSize: number;
  /** True if Kite can quote/serve this exchange (false → reference-only, e.g. NSEIX). */
  quotable: boolean;
}

export interface SearchGroups {
  equity: InstrumentResult[];
  indices: InstrumentResult[];
  futures: InstrumentResult[];
  options: InstrumentResult[];
}

export interface ParsedQuery {
  text: string; // remaining free text (underlying-ish)
  strike?: number;
  optionType?: "CE" | "PE";
  wantsFutures: boolean;
  wantsOptions: boolean;
}

/** Classify a raw Kite instrument into a UI segment + type. */
export function classify(ins: Instrument): { uiSegment: UiSegment; uiType: UiInstrumentType } {
  const seg = ins.segment.toUpperCase();
  const type = ins.instrumentType.toUpperCase();
  if (type === "FUT") return { uiSegment: "futures", uiType: "FUT" };
  if (type === "CE") return { uiSegment: "options", uiType: "CE" };
  if (type === "PE") return { uiSegment: "options", uiType: "PE" };
  // Indices: Kite marks these with segment "INDICES" (instrument_type EQ, strike 0).
  if (seg === "INDICES" || ins.exchange.toUpperCase() === "INDICES") {
    return { uiSegment: "indices", uiType: "INDEX" };
  }
  return { uiSegment: "equity", uiType: "EQ" };
}

/** Build a readable label, e.g. "NIFTY 24500 CE · 26 Jun" or "MIDCPNIFTY FUT · 26 Jun". */
export function displayName(ins: Instrument, uiType: UiInstrumentType): string {
  const expiryLabel = ins.expiry ? ` · ${formatExpiry(ins.expiry)}` : "";
  if (uiType === "FUT") return `${ins.name} FUT${expiryLabel}`;
  if (uiType === "CE" || uiType === "PE") {
    return `${ins.name} ${formatStrike(ins.strike)} ${uiType}${expiryLabel}`;
  }
  if (uiType === "INDEX") return `${ins.name} (Index)`;
  // Equity: prefer name when it differs meaningfully from the symbol.
  return ins.name && ins.name !== ins.tradingsymbol ? `${ins.tradingsymbol} · ${ins.name}` : ins.tradingsymbol;
}

function formatStrike(strike: number): string {
  return Number.isInteger(strike) ? String(strike) : String(strike);
}

function formatExpiry(iso: string): string {
  // iso is YYYY-MM-DD; render "26 Jun" style.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = m[3];
  const mon = months[Number(m[2]) - 1] ?? m[2];
  return `${Number(day)} ${mon}`;
}

export function toResult(ins: Instrument): InstrumentResult {
  const { uiSegment, uiType } = classify(ins);
  return {
    instrument: `${ins.exchange}:${ins.tradingsymbol}`,
    instrumentToken: ins.instrumentToken,
    exchange: ins.exchange,
    tradingsymbol: ins.tradingsymbol,
    name: ins.name,
    displayName: displayName(ins, uiType),
    segment: ins.segment,
    uiSegment,
    instrumentType: uiType,
    expiry: ins.expiry,
    strike: ins.strike,
    optionType: uiType === "CE" || uiType === "PE" ? uiType : "",
    lotSize: ins.lotSize,
    tickSize: ins.tickSize,
    quotable: isSupportedExchange(ins.exchange),
  };
}

/** Parse a Zerodha-like free-text query into structured hints. */
export function parseQuery(raw: string): ParsedQuery {
  const tokens = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
  let strike: number | undefined;
  let optionType: "CE" | "PE" | undefined;
  let wantsFutures = false;
  let wantsOptions = false;
  const rest: string[] = [];

  for (const tk of tokens) {
    if (tk === "CE" || tk === "PE") {
      optionType = tk;
      wantsOptions = true;
    } else if (tk === "FUT" || tk === "FUTURES" || tk === "FUT.") {
      wantsFutures = true;
    } else if (tk === "CALL") {
      optionType = "CE";
      wantsOptions = true;
    } else if (tk === "PUT") {
      optionType = "PE";
      wantsOptions = true;
    } else if (/^\d+(\.\d+)?$/.test(tk)) {
      strike = Number(tk);
      wantsOptions = true;
    } else {
      rest.push(tk);
    }
  }
  return { text: rest.join(" "), strike, optionType, wantsFutures, wantsOptions };
}

export interface GroupedSearchFilters {
  q?: string;
  segment?: "equity" | "indices" | "futures" | "options" | "all" | string;
  underlying?: string;
  instrumentType?: string;
  expiry?: string;
  strike?: number;
  optionType?: string;
  limitPerGroup?: number;
}

/**
 * Zerodha-like grouped search. Pure over `list`. Parses the free-text query,
 * filters, ranks (exact symbol/name first; equity & index before F&O; nearest
 * expiry next), and groups by UI segment.
 */
export function groupedSearch(list: Instrument[], filters: GroupedSearchFilters): SearchGroups {
  const parsed = parseQuery(filters.q ?? "");
  const text = (filters.underlying ?? parsed.text ?? "").trim().toUpperCase();
  const segFilter = (filters.segment ?? "all").toLowerCase();
  const wantStrike = filters.strike ?? parsed.strike;
  const wantOption = (filters.optionType ?? parsed.optionType ?? "").toUpperCase();
  const wantType = (filters.instrumentType ?? "").toUpperCase();
  const expiry = (filters.expiry ?? "").trim();
  const perGroup = filters.limitPerGroup && filters.limitPerGroup > 0 ? filters.limitPerGroup : 20;

  const scored: { r: InstrumentResult; score: number }[] = [];

  for (const ins of list) {
    const { uiSegment, uiType } = classify(ins);

    if (segFilter !== "all" && uiSegment !== segFilter) continue;
    if (wantType && uiType !== wantType) continue;
    if (wantOption && uiType !== wantOption) continue;
    if (wantStrike != null && (uiType === "CE" || uiType === "PE") && ins.strike !== wantStrike) continue;
    if (expiry && !(ins.expiry === expiry || ins.expiry.startsWith(expiry))) continue;

    // Text match against symbol + name.
    if (text) {
      const nameU = ins.name.toUpperCase();
      const symU = ins.tradingsymbol.toUpperCase();
      if (!nameU.includes(text) && !symU.includes(text)) continue;
    }

    // Respect FUT/OPT hints from the query when no explicit segment filter.
    if (segFilter === "all") {
      if (parsed.wantsFutures && !parsed.wantsOptions && uiSegment !== "futures" && uiSegment !== "equity" && uiSegment !== "indices") {
        // wanting futures shouldn't surface options
        if (uiSegment === "options") continue;
      }
      if (parsed.wantsOptions && uiSegment === "futures") continue;
    }

    // --- scoring (lower is better) ---
    let score = 0;
    const nameU = ins.name.toUpperCase();
    const symU = ins.tradingsymbol.toUpperCase();
    if (text) {
      if (nameU === text || symU === text) score -= 100; // exact
      else if (nameU.startsWith(text) || symU.startsWith(text)) score -= 40; // prefix
    }
    // equity & indices rank above derivatives by default
    if (uiSegment === "equity") score -= 8;
    else if (uiSegment === "indices") score -= 6;
    // nearest expiry first for F&O
    if (ins.expiry) score += expiryRank(ins.expiry);

    scored.push({ r: toResult(ins), score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    // tie-breakers: expiry, strike, symbol
    if (a.r.expiry !== b.r.expiry) return a.r.expiry.localeCompare(b.r.expiry);
    if (a.r.strike !== b.r.strike) return a.r.strike - b.r.strike;
    return a.r.tradingsymbol.localeCompare(b.r.tradingsymbol);
  });

  const groups: SearchGroups = { equity: [], indices: [], futures: [], options: [] };
  for (const { r } of scored) {
    const g = groups[r.uiSegment];
    if (g.length < perGroup) g.push(r);
  }
  return groups;
}

/** Days-from-today as a small positive number for ranking (expired → large). */
function expiryRank(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 50;
  const days = Math.round((t - Date.now()) / 86_400_000);
  if (days < 0) return 1000 + Math.abs(days); // de-prioritise past
  return days;
}
