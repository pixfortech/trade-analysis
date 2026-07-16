// =====================================================================
// Canonical instrument identity resolution (READ-ONLY). Maps a raw Kite
// instrument (exchange / tradingsymbol / type / name / expiry / strike) to a
// stable identity used for news relevance: canonical + underlying + aliases +
// related entities + sector + benchmark. Derivatives resolve to their
// underlying (RELIANCE26JULFUT → RELIANCE; MIDCPNIFTY26JULFUT → MIDCPNIFTY).
//
// The index/sector taxonomy is CENTRALISED in config/instrumentTaxonomy.config
// (env/JSON-overridable via INSTRUMENT_TAXONOMY_JSON); relevance thresholds live
// in intelConfig.news.relevance. No business mappings are embedded here.
// =====================================================================

import { taxonomy, type IndexDef } from "../config/instrumentTaxonomy.config";

export type AssetClass = "equity" | "index" | "futures" | "options";
export type IdentityType = "stock" | "index" | "sector";

export interface InstrumentIdentity {
  canonical: string; // e.g. RELIANCE, MIDCPNIFTY, BANKNIFTY, NIFTY
  underlying: string;
  underlyingDisplay: string; // "Reliance Industries", "Nifty Midcap Select"
  assetClass: AssetClass;
  identityType: IdentityType;
  aliases: string[]; // lowercase whole-word match tokens/phrases (incl. canonical)
  relatedEntities: string[]; // lowercase sector/commodity/entity phrases
  sector: string | null;
  benchmark: string; // NIFTY | BANKNIFTY | SENSEX
}

// Kite F&O exchange codes (protocol constants, not business mappings).
const NFO_EXCHANGES = new Set(["NFO", "BFO", "MCX", "CDS", "BCD"]);

/** Strip a derivative tradingsymbol to its underlying (alpha prefix before the
 *  expiry digits). RELIANCE26JULFUT→RELIANCE; BANKNIFTY2570824500CE→BANKNIFTY. */
function underlyingFromSymbol(tradingsymbol: string): string {
  const m = tradingsymbol.toUpperCase().match(/^([A-Z&]+?)\d/);
  if (m && m[1].length >= 2) return m[1];
  return tradingsymbol.toUpperCase().replace(/\s+/g, " ").trim();
}

/** Normalise an index-ish name/symbol to a taxonomy canonical, if any. */
function matchIndex(candidate: string): IndexDef | null {
  const c = candidate.toLowerCase().trim();
  for (const idx of taxonomy.indices) {
    if (idx.canonical.toLowerCase() === c) return idx;
    if (idx.aliases.some((a) => a === c)) return idx;
  }
  // Looser: NSE index tradingsymbols like "NIFTY 50", "NIFTY BANK".
  const byCanon = (canon: string) => taxonomy.indices.find((i) => i.canonical === canon) ?? null;
  if (/\bbank\b/.test(c) && c.includes("nifty")) return byCanon("BANKNIFTY");
  if (/\bfin\b|financial/.test(c) && c.includes("nifty")) return byCanon("FINNIFTY");
  if (/midcap|midcp/.test(c)) return byCanon("MIDCPNIFTY");
  if (c.includes("sensex")) return byCanon("SENSEX");
  if (c.includes("nifty")) return byCanon("NIFTY");
  return null;
}

export interface IdentityInput {
  exchange: string;
  tradingsymbol: string;
  instrumentType?: string | null; // EQ / FUT / CE / PE
  name?: string | null; // Kite `name` — usually the underlying for F&O
  displayName?: string | null;
  expiry?: string | null;
  strike?: number | null;
  optionType?: string | null;
}

export function resolveIdentity(input: IdentityInput): InstrumentIdentity {
  const exch = (input.exchange || "").toUpperCase();
  const itype = (input.instrumentType || "").toUpperCase();
  const isFO = NFO_EXCHANGES.has(exch) || ["FUT", "CE", "PE"].includes(itype);
  const assetClass: AssetClass = itype === "FUT" ? "futures" : itype === "CE" || itype === "PE" ? "options" : isFO ? "futures" : /INDICES?/.test(exch) ? "index" : "equity";

  // Underlying: prefer Kite `name` for F&O; else strip the symbol; else the symbol.
  const rawUnderlying = isFO
    ? (input.name && input.name.trim() ? input.name : underlyingFromSymbol(input.tradingsymbol))
    : input.tradingsymbol;
  const underlyingUpper = rawUnderlying.toUpperCase().replace(/\s+/g, " ").trim();

  // Index?
  const idx = matchIndex(underlyingUpper) ?? matchIndex(input.tradingsymbol) ?? matchIndex(input.displayName || "");
  if (idx) {
    return {
      canonical: idx.canonical,
      underlying: idx.canonical,
      underlyingDisplay: idx.display,
      assetClass: isFO ? assetClass : "index",
      identityType: idx.sector ? "sector" : "index",
      aliases: uniq([idx.canonical.toLowerCase(), ...idx.aliases]),
      relatedEntities: uniq(idx.related),
      sector: idx.sector,
      benchmark: idx.benchmark,
    };
  }

  // Stock (equity or stock F&O).
  const key = underlyingUpper.replace(/\s+/g, "");
  const sectorDef = taxonomy.sectors[key];
  const display = input.name && input.name.trim() ? input.name : underlyingUpper;
  const nameTokens = (display || "").toLowerCase().split(/[^a-z0-9&]+/).filter((t) => t.length >= 3);
  const aliases = uniq([underlyingUpper.toLowerCase(), key.toLowerCase(), ...(sectorDef?.aliases ?? []), ...nameTokens]);
  return {
    canonical: underlyingUpper,
    underlying: underlyingUpper,
    underlyingDisplay: display,
    assetClass: isFO ? assetClass : "equity",
    identityType: "stock",
    aliases,
    relatedEntities: uniq(sectorDef?.related ?? []),
    sector: sectorDef?.sector ?? null,
    benchmark: sectorDef?.benchmark ?? "NIFTY",
  };
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean)));
}
