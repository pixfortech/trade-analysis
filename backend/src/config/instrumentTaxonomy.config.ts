// =====================================================================
// CENTRAL instrument-taxonomy config — the ONE place index/stock/sector
// reference data lives (no business mappings embedded in service logic).
// Indices, stock→sector mappings, aliases, related entities, benchmark
// mappings and generic market-wide terms are all here, with a full env/JSON
// override via INSTRUMENT_TAXONOMY_JSON (merged over the documented defaults).
// =====================================================================

function warn(msg: string) {
  // eslint-disable-next-line no-console
  console.warn(`[taxonomy] ${msg}`);
}

export interface IndexDef {
  canonical: string;
  display: string;
  aliases: string[];
  related: string[];
  sector: string | null;
  benchmark: string;
}
export interface SectorDef {
  sector: string;
  aliases: string[];
  related: string[];
  benchmark: string;
}
export interface Taxonomy {
  indices: IndexDef[];
  sectors: Record<string, SectorDef>;
  benchmarkAliases: Record<string, string[]>;
  marketWideTerms: string[];
}

/* --------------------------- documented defaults ------------------------- */
const DEFAULT_INDICES: IndexDef[] = [
  { canonical: "NIFTY", display: "Nifty 50", aliases: ["nifty", "nifty 50", "nifty50"], related: ["large cap", "largecap", "benchmark index", "india market", "d-street", "dalal street"], sector: null, benchmark: "NIFTY" },
  { canonical: "BANKNIFTY", display: "Bank Nifty", aliases: ["bank nifty", "banknifty", "nifty bank"], related: ["bank", "banks", "banking", "rbi", "repo rate", "rate cut", "rate hike", "liquidity", "hdfc bank", "icici bank", "sbi", "kotak", "axis bank", "lending", "npa", "deposit"], sector: "banking", benchmark: "BANKNIFTY" },
  { canonical: "FINNIFTY", display: "Nifty Financial Services", aliases: ["fin nifty", "finnifty", "nifty fin service", "nifty financial"], related: ["financial", "nbfc", "insurance", "rbi", "bank", "lending", "hdfc"], sector: "financials", benchmark: "NIFTY" },
  { canonical: "MIDCPNIFTY", display: "Nifty Midcap Select", aliases: ["midcap nifty", "midcpnifty", "nifty midcap", "nifty midcap select", "midcap select"], related: ["midcap", "mid cap", "mid-cap", "broader market", "small and mid"], sector: null, benchmark: "NIFTY" },
  { canonical: "SENSEX", display: "Sensex", aliases: ["sensex", "bse sensex", "s&p bse sensex"], related: ["large cap", "bse", "benchmark index", "india market"], sector: null, benchmark: "SENSEX" },
];

const DEFAULT_SECTORS: Record<string, SectorDef> = {
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

const DEFAULT_BENCHMARK_ALIASES: Record<string, string[]> = {
  NIFTY: ["nifty", "nifty 50", "nifty50"],
  BANKNIFTY: ["bank nifty", "banknifty", "nifty bank"],
  SENSEX: ["sensex", "bse"],
};

const DEFAULT_MARKET_WIDE_TERMS = ["market", "markets", "sensex", "nifty", "index", "indices", "stocks", "equities", "d-street", "dalal street", "fii", "dii", "rupee", "share market", "stock market"];

/* ------------------------------ env override ----------------------------- */
function loadOverride(): Partial<Taxonomy> {
  const raw = process.env.INSTRUMENT_TAXONOMY_JSON;
  if (raw == null || raw.trim() === "") return {};
  try {
    const o = JSON.parse(raw) as Partial<Taxonomy>;
    return o && typeof o === "object" ? o : {};
  } catch {
    warn("INSTRUMENT_TAXONOMY_JSON is not valid JSON — using defaults.");
    return {};
  }
}

/** Merge override indices over defaults by canonical (replace or add). */
function mergeIndices(base: IndexDef[], over?: IndexDef[]): IndexDef[] {
  if (!over || !Array.isArray(over) || over.length === 0) return base;
  const byCanon = new Map(base.map((i) => [i.canonical.toUpperCase(), i]));
  for (const o of over) {
    if (o && typeof o.canonical === "string") byCanon.set(o.canonical.toUpperCase(), { ...byCanon.get(o.canonical.toUpperCase()), ...o } as IndexDef);
  }
  return [...byCanon.values()];
}

const override = loadOverride();

export const taxonomy: Taxonomy = {
  indices: mergeIndices(DEFAULT_INDICES, override.indices),
  sectors: { ...DEFAULT_SECTORS, ...(override.sectors ?? {}) },
  benchmarkAliases: { ...DEFAULT_BENCHMARK_ALIASES, ...(override.benchmarkAliases ?? {}) },
  marketWideTerms: Array.isArray(override.marketWideTerms) && override.marketWideTerms.length ? override.marketWideTerms : DEFAULT_MARKET_WIDE_TERMS,
};

/** Benchmark aliases for a benchmark canonical (falls back to NIFTY). */
export function benchmarkAliasesFor(benchmark: string): string[] {
  return taxonomy.benchmarkAliases[benchmark] ?? taxonomy.benchmarkAliases.NIFTY;
}
