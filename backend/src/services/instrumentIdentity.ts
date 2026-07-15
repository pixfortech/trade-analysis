// =====================================================================
// Canonical instrument identity resolution (READ-ONLY). Maps a raw Kite
// instrument (exchange / tradingsymbol / type / name / expiry / strike) to a
// stable identity used for news relevance: canonical + underlying + aliases +
// related entities + sector + benchmark. Derivatives resolve to their
// underlying (RELIANCE26JULFUT → RELIANCE; MIDCPNIFTY26JULFUT → MIDCPNIFTY).
//
// The index/sector TAXONOMY is reference data (not a runtime-tunable value); the
// relevance THRESHOLDS/weights live in intelConfig.news.relevance.
// =====================================================================

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

interface IndexDef { canonical: string; display: string; aliases: string[]; related: string[]; sector: string | null; benchmark: string }
interface SectorDef { sector: string; aliases: string[]; related: string[]; benchmark: string }

// Known Indian indices → canonical identity + aliases + related context.
const INDEX_TAXONOMY: IndexDef[] = [
  { canonical: "NIFTY", display: "Nifty 50", aliases: ["nifty", "nifty 50", "nifty50"], related: ["large cap", "largecap", "benchmark index", "india market", "d-street", "dalal street"], sector: null, benchmark: "NIFTY" },
  { canonical: "BANKNIFTY", display: "Bank Nifty", aliases: ["bank nifty", "banknifty", "nifty bank"], related: ["bank", "banks", "banking", "rbi", "repo rate", "rate cut", "rate hike", "liquidity", "hdfc bank", "icici bank", "sbi", "kotak", "axis bank", "lending", "npa", "deposit"], sector: "banking", benchmark: "BANKNIFTY" },
  { canonical: "FINNIFTY", display: "Nifty Financial Services", aliases: ["fin nifty", "finnifty", "nifty fin service", "nifty financial"], related: ["financial", "nbfc", "insurance", "rbi", "bank", "lending", "hdfc"], sector: "financials", benchmark: "NIFTY" },
  { canonical: "MIDCPNIFTY", display: "Nifty Midcap Select", aliases: ["midcap nifty", "midcpnifty", "nifty midcap", "nifty midcap select", "midcap select"], related: ["midcap", "mid cap", "mid-cap", "broader market", "small and mid"], sector: null, benchmark: "NIFTY" },
  { canonical: "SENSEX", display: "Sensex", aliases: ["sensex", "bse sensex", "s&p bse sensex"], related: ["large cap", "bse", "benchmark index", "india market"], sector: null, benchmark: "SENSEX" },
];

// Common stock → sector mapping (for related-entity / benchmark context).
const SECTOR_TAXONOMY: Record<string, SectorDef> = {
  RELIANCE: { sector: "energy", aliases: ["reliance", "reliance industries", "ril", "reliance jio", "jio", "reliance retail"], related: ["oil", "refining", "petrochemical", "crude", "gas", "telecom", "5g", "retail", "o2c"], benchmark: "NIFTY" },
  ONGC: { sector: "energy", aliases: ["ongc", "oil and natural gas"], related: ["oil", "crude", "gas", "refining"], benchmark: "NIFTY" },
  HDFCBANK: { sector: "banking", aliases: ["hdfc bank", "hdfcbank"], related: ["bank", "rbi", "repo rate", "lending", "deposit", "npa"], benchmark: "BANKNIFTY" },
  ICICIBANK: { sector: "banking", aliases: ["icici bank", "icicibank"], related: ["bank", "rbi", "repo rate", "lending", "deposit", "npa"], benchmark: "BANKNIFTY" },
  SBIN: { sector: "banking", aliases: ["sbi", "state bank", "state bank of india"], related: ["bank", "rbi", "repo rate", "lending", "psu bank"], benchmark: "BANKNIFTY" },
  KOTAKBANK: { sector: "banking", aliases: ["kotak", "kotak mahindra"], related: ["bank", "rbi", "lending"], benchmark: "BANKNIFTY" },
  AXISBANK: { sector: "banking", aliases: ["axis bank", "axisbank"], related: ["bank", "rbi", "lending"], benchmark: "BANKNIFTY" },
  INFY: { sector: "it", aliases: ["infosys", "infy"], related: ["it", "software", "tech", "nasdaq", "us economy", "deal wins"], benchmark: "NIFTY" },
  TCS: { sector: "it", aliases: ["tcs", "tata consultancy"], related: ["it", "software", "tech", "nasdaq", "us economy"], benchmark: "NIFTY" },
  WIPRO: { sector: "it", aliases: ["wipro"], related: ["it", "software", "tech"], benchmark: "NIFTY" },
  TATAMOTORS: { sector: "auto", aliases: ["tata motors", "tatamotors", "jlr", "jaguar land rover"], related: ["auto", "vehicle", "ev", "sales"], benchmark: "NIFTY" },
  MARUTI: { sector: "auto", aliases: ["maruti", "maruti suzuki"], related: ["auto", "car", "vehicle", "sales"], benchmark: "NIFTY" },
  SUNPHARMA: { sector: "pharma", aliases: ["sun pharma", "sunpharma"], related: ["pharma", "drug", "usfda", "generic"], benchmark: "NIFTY" },
  TATASTEEL: { sector: "metals", aliases: ["tata steel", "tatasteel"], related: ["steel", "metal", "commodity", "china"], benchmark: "NIFTY" },
  JSWSTEEL: { sector: "metals", aliases: ["jsw steel", "jswsteel"], related: ["steel", "metal", "commodity"], benchmark: "NIFTY" },
};

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
  for (const idx of INDEX_TAXONOMY) {
    if (idx.canonical.toLowerCase() === c) return idx;
    if (idx.aliases.some((a) => a === c)) return idx;
  }
  // Looser: NSE index tradingsymbols like "NIFTY 50", "NIFTY BANK".
  if (/\bbank\b/.test(c) && c.includes("nifty")) return INDEX_TAXONOMY.find((i) => i.canonical === "BANKNIFTY") ?? null;
  if (/\bfin\b|financial/.test(c) && c.includes("nifty")) return INDEX_TAXONOMY.find((i) => i.canonical === "FINNIFTY") ?? null;
  if (/midcap|midcp/.test(c)) return INDEX_TAXONOMY.find((i) => i.canonical === "MIDCPNIFTY") ?? null;
  if (c.includes("sensex")) return INDEX_TAXONOMY.find((i) => i.canonical === "SENSEX") ?? null;
  if (c.includes("nifty")) return INDEX_TAXONOMY.find((i) => i.canonical === "NIFTY") ?? null;
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
  const sectorDef = SECTOR_TAXONOMY[key];
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
