// Public runtime config — the SINGLE frontend source of truth for runtime/
// business defaults (refresh intervals, default instruments, default indicator
// set, feature flags, approval thresholds, labels). The backend owns these
// values and serves them at GET /api/config/public; this module mirrors that
// shape and provides a SAFE LOCAL FALLBACK so the dashboard still renders when
// the backend is briefly unreachable. Components must read from here (via
// usePublicConfig), never hardcode these values inline.
//
// The fallback intentionally mirrors the backend defaults. It is a centralised,
// overrideable default — the live server config always wins once it loads.

export interface ConfigSymbol {
  instrument: string;
  displayName: string;
}

export interface PublicConfig {
  refresh: {
    liveSignalMs: number;
    watchlistMs: number;
    intelligenceMs: number;
    topStripMs: number;
    vixMs: number;
    kiteStatusMs: number;
  };
  defaults: {
    topStripSymbols: ConfigSymbol[];
    watchlistSymbols: ConfigSymbol[];
    benchmarkSymbols: string[];
    activeIndicators: string[];
    vixQuoteSymbol: string;
  };
  features: {
    newsEnabled: boolean;
    intelligenceEnabled: boolean;
    newsProvider: string;
  };
  labels: {
    readOnlyNotice: string;
  };
  session: {
    timezone: string;
    openMinutes: number;
    closeMinutes: number;
    preopenMinutes: number;
  };
  stream: {
    tickReconnectMs: number;
    pollingFallbackMs: number;
    quoteStaleSec: number;
    showMillis: boolean;
    /** Whether to open the SSE tick stream (Kite WebSocket relay). */
    wsEnabled: boolean;
    /** A streamed tick older than this (ms) is stale → REST fallback / block fresh entry. */
    tickStaleMs: number;
    sseKeepaliveMs: number;
  };
  winThreshold: number;
  minEnterConfidence: number;
  trade: TradeConfig;
  readOnly: boolean;
}

/** Trade-preview config (Tentative P/L, safe-exit, sizing, costs, ENTER alert). */
export interface TradeConfig {
  defaultLots: number;
  safeExit: {
    atrMult: number;
    minSpanFraction: number;
    maxSpanFraction: number;
    structureBufferPct: number;
  };
  costs: {
    enabled: boolean;
    brokeragePerOrder: number;
    orderLegs: number;
    taxesPctOfTurnover: number;
  };
  alerts: {
    enterCooldownMs: number;
    soundEnabled: boolean;
  };
  continuationAtrMult: number;
  /** Move % past the analysed price that flags the locked plan "no longer optimal —
   *  Re-analyse recommended". Never moves levels or auto-regenerates the plan. */
  planStaleMovePct: number;
}

/**
 * Safe local fallback. Mirrors the backend's documented defaults so the UI is
 * fully functional offline; superseded by GET /api/config/public on load.
 */
export const FALLBACK_PUBLIC_CONFIG: PublicConfig = {
  refresh: {
    liveSignalMs: 5_000,
    watchlistMs: 12_000,
    intelligenceMs: 45_000,
    topStripMs: 10_000,
    vixMs: 60_000,
    kiteStatusMs: 20_000,
  },
  defaults: {
    topStripSymbols: [
      { instrument: "NSE:NIFTY 50", displayName: "NIFTY 50" },
      { instrument: "NSE:NIFTY BANK", displayName: "BANK NIFTY" },
      { instrument: "NSE:NIFTY FIN SERVICE", displayName: "FIN NIFTY" },
      { instrument: "BSE:SENSEX", displayName: "SENSEX" },
    ],
    watchlistSymbols: [
      { instrument: "NSE:RELIANCE", displayName: "RELIANCE" },
      { instrument: "NSE:INFY", displayName: "INFY" },
    ],
    benchmarkSymbols: ["NSE:NIFTY 50", "NSE:NIFTY BANK"],
    activeIndicators: ["VWAP", "EMA20", "EMA50", "RSI", "MACD", "ADX", "ATR", "SUPERTREND", "VOLUME", "OI"],
    vixQuoteSymbol: "NSE:INDIA VIX",
  },
  features: {
    newsEnabled: true,
    intelligenceEnabled: true,
    newsProvider: "rss",
  },
  labels: {
    readOnlyNotice: "Advisory market intelligence — read-only. No order placement, modification or execution.",
  },
  session: { timezone: "Asia/Kolkata", openMinutes: 555, closeMinutes: 930, preopenMinutes: 540 },
  stream: { tickReconnectMs: 5_000, pollingFallbackMs: 5_000, quoteStaleSec: 90, showMillis: true, wsEnabled: true, tickStaleMs: 5_000, sseKeepaliveMs: 15_000 },
  winThreshold: 75,
  minEnterConfidence: 75,
  trade: {
    defaultLots: 1,
    safeExit: { atrMult: 1, minSpanFraction: 0.25, maxSpanFraction: 0.95, structureBufferPct: 0.05 },
    costs: { enabled: false, brokeragePerOrder: 20, orderLegs: 2, taxesPctOfTurnover: 0.05 },
    alerts: { enterCooldownMs: 60_000, soundEnabled: true },
    continuationAtrMult: 0.75,
    planStaleMovePct: 0.35,
  },
  readOnly: true,
};

/**
 * Merge a partial server payload onto the fallback so a malformed/partial
 * response can never leave a section undefined. Only known keys are taken.
 */
export function mergePublicConfig(raw: unknown): PublicConfig {
  const base = FALLBACK_PUBLIC_CONFIG;
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<PublicConfig>;
  return {
    refresh: { ...base.refresh, ...(r.refresh ?? {}) },
    defaults: {
      topStripSymbols: pickSymbols(r.defaults?.topStripSymbols) ?? base.defaults.topStripSymbols,
      watchlistSymbols: pickSymbols(r.defaults?.watchlistSymbols) ?? base.defaults.watchlistSymbols,
      benchmarkSymbols: pickStrings(r.defaults?.benchmarkSymbols) ?? base.defaults.benchmarkSymbols,
      activeIndicators: pickStrings(r.defaults?.activeIndicators) ?? base.defaults.activeIndicators,
      vixQuoteSymbol: typeof r.defaults?.vixQuoteSymbol === "string" && r.defaults.vixQuoteSymbol ? r.defaults.vixQuoteSymbol : base.defaults.vixQuoteSymbol,
    },
    features: { ...base.features, ...(r.features ?? {}) },
    labels: { ...base.labels, ...(r.labels ?? {}) },
    session: { ...base.session, ...(r.session ?? {}) },
    stream: { ...base.stream, ...(r.stream ?? {}) },
    winThreshold: typeof r.winThreshold === "number" ? r.winThreshold : base.winThreshold,
    minEnterConfidence: typeof r.minEnterConfidence === "number" ? r.minEnterConfidence : base.minEnterConfidence,
    trade: mergeTrade(r.trade, base.trade),
    readOnly: typeof r.readOnly === "boolean" ? r.readOnly : base.readOnly,
  };
}

/** Deep-merge the trade block so a partial/malformed payload keeps valid nested defaults. */
function mergeTrade(r: Partial<TradeConfig> | undefined, base: TradeConfig): TradeConfig {
  if (!r || typeof r !== "object") return base;
  return {
    defaultLots: typeof r.defaultLots === "number" && r.defaultLots > 0 ? r.defaultLots : base.defaultLots,
    safeExit: { ...base.safeExit, ...(r.safeExit ?? {}) },
    costs: { ...base.costs, ...(r.costs ?? {}) },
    alerts: { ...base.alerts, ...(r.alerts ?? {}) },
    continuationAtrMult: typeof r.continuationAtrMult === "number" ? r.continuationAtrMult : base.continuationAtrMult,
    planStaleMovePct: typeof r.planStaleMovePct === "number" ? r.planStaleMovePct : base.planStaleMovePct,
  };
}

function pickSymbols(v: unknown): ConfigSymbol[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .filter((x): x is ConfigSymbol => !!x && typeof x === "object" && typeof (x as ConfigSymbol).instrument === "string")
    .map((x) => ({ instrument: x.instrument, displayName: typeof x.displayName === "string" && x.displayName ? x.displayName : x.instrument }));
  return out.length ? out : null;
}

function pickStrings(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length ? out : null;
}
