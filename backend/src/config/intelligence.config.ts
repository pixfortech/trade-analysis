// =====================================================================
// CENTRAL CONFIG for the market-intelligence engine (news + VIX + decision
// weights + breadth + refresh intervals + defaults). This is the ONE place
// runtime/business values live. Everything is env-overridable; the values here
// are the documented, overrideable defaults — services/components must read
// from this module, never hardcode. Validated on load (invalid → safe default
// with a warning). Secrets (API keys) live here but are NEVER in publicConfig().
// =====================================================================

function warn(msg: string) {
  // eslint-disable-next-line no-console
  console.warn(`[config] ${msg}`);
}

function numEnv(name: string, def: number, min?: number, max?: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    warn(`${name}="${raw}" is not a number — using default ${def}.`);
    return def;
  }
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

function listEnv(name: string, def: string[]): string[] {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return def;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : def;
}

function urlsEnv(name: string, def: string[]): string[] {
  return listEnv(name, def).filter((u) => {
    try {
      new URL(u);
      return true;
    } catch {
      warn(`${name}: ignoring invalid URL "${u}".`);
      return false;
    }
  });
}

/** "EXCH:SYM|Display,EXCH:SYM|Display" → [{instrument, displayName}]. */
function symbolListEnv(name: string, def: { instrument: string; displayName: string }[]): { instrument: string; displayName: string }[] {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return def;
  const out = raw
    .split(",")
    .map((s) => {
      const [i, d] = s.split("|");
      const instrument = (i ?? "").trim();
      return { instrument, displayName: (d ?? i ?? "").trim() };
    })
    .filter((x) => x.instrument);
  return out.length ? out : def;
}

function enumEnv<T extends string>(name: string, def: T, allowed: readonly T[]): T {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return def;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  warn(`${name}="${raw}" invalid — using "${def}".`);
  return def;
}

function flagEnv(name: string, def: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return def;
  return raw.trim().toLowerCase() === "true";
}

/* --------------------------------- defaults ------------------------------ */
const DEFAULT_RSS = [
  "https://www.moneycontrol.com/rss/marketreports.xml",
  "https://www.moneycontrol.com/rss/business.xml",
  "https://www.business-standard.com/rss/markets-106.rss",
  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
];
const DEFAULT_POSITIVE = ["surge", "surges", "surged", "jump", "jumps", "jumped", "rally", "rallies", "gain", "gains", "gained", "rise", "rises", "soar", "soars", "record high", "beats", "beat", "profit", "profits", "upgrade", "upgraded", "bullish", "outperform", "boost", "boosts", "recovery", "rebound", "rebounds", "growth", "wins", "approval", "approved", "dividend", "bonus", "expands", "strong demand", "raises guidance", "buyback"];
const DEFAULT_NEGATIVE = ["fall", "falls", "fell", "drop", "drops", "dropped", "plunge", "plunges", "plunged", "slump", "slumps", "crash", "crashes", "loss", "losses", "decline", "declines", "downgrade", "downgraded", "bearish", "underperform", "weak", "warning", "warns", "probe", "fraud", "ban", "bans", "layoff", "layoffs", "default", "defaults", "concern", "concerns", "fear", "fears", "recession", "scam", "penalty", "penalised", "cut", "cuts", "misses estimates", "profit falls"];
const DEFAULT_HIGH_IMPACT = ["rbi", "fed", "fomc", "inflation", "gdp", "budget", "war", "crude", "oil price", "election", "repo rate", "rate hike", "rate cut", "sebi", "downgrade", "crash", "tariff", "sanction", "global selloff", "us fed", "recession", "default"];
const DEFAULT_VIX_SYMBOLS = ["NSE:INDIA VIX", "NSE:INDIAVIX"];
const DEFAULT_EQUITY_UNIVERSE = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "LT", "KOTAKBANK", "AXISBANK", "HINDUNILVR", "BAJFINANCE", "MARUTI", "SUNPHARMA", "TATAMOTORS", "WIPRO", "ULTRACEMCO", "TITAN", "ADANIENT", "POWERGRID", "NTPC", "TATASTEEL", "JSWSTEEL", "M&M"];
const DEFAULT_TOP_STRIP = [
  { instrument: "NSE:NIFTY 50", displayName: "NIFTY 50" },
  { instrument: "NSE:NIFTY BANK", displayName: "BANK NIFTY" },
  { instrument: "NSE:NIFTY FIN SERVICE", displayName: "FIN NIFTY" },
  { instrument: "BSE:SENSEX", displayName: "SENSEX" },
];
const DEFAULT_WATCHLIST = [
  { instrument: "NSE:RELIANCE", displayName: "RELIANCE" },
  { instrument: "NSE:INFY", displayName: "INFY" },
];
// Default indicator set the client requests from the backend (runtime value:
// it flows into chart-data / live-signal calls as `activeIndicators`).
const DEFAULT_ACTIVE_INDICATORS = ["VWAP", "EMA20", "EMA50", "RSI", "MACD", "ADX", "ATR", "SUPERTREND", "VOLUME", "OI"];

/* ----------------------------- decision weights -------------------------- */
// Raw weights, then normalised to sum 1 (defensive against bad env values).
const rawWeights = {
  technical: numEnv("INTEL_TECHNICAL_WEIGHT", 0.45, 0, 1),
  news: numEnv("INTEL_NEWS_WEIGHT", 0.2, 0, 1),
  breadth: numEnv("INTEL_BREADTH_WEIGHT", 0.2, 0, 1),
  volume: numEnv("INTEL_VOLUME_WEIGHT", 0.15, 0, 1),
};
const weightSum = rawWeights.technical + rawWeights.news + rawWeights.breadth + rawWeights.volume;
const weights =
  weightSum > 0
    ? { technical: rawWeights.technical / weightSum, news: rawWeights.news / weightSum, breadth: rawWeights.breadth / weightSum, volume: rawWeights.volume / weightSum }
    : { technical: 0.45, news: 0.2, breadth: 0.2, volume: 0.15 };
if (weightSum <= 0) warn("INTEL_*_WEIGHT summed to 0 — using default weights.");

/* --------------------------------- config -------------------------------- */
export const intelConfig = {
  news: {
    provider: enumEnv("NEWS_PROVIDER", "rss", ["rss", "newsapi", "disabled"] as const),
    apiKey: (process.env.NEWS_API_KEY ?? "").trim(),
    rssUrls: urlsEnv("NEWS_RSS_URLS", DEFAULT_RSS),
    maxItems: numEnv("NEWS_MAX_ITEMS", 30, 1, 200),
    perFeedCap: numEnv("NEWS_PER_FEED_CAP", 40, 1, 200),
    cacheMs: numEnv("NEWS_CACHE_MINUTES", 5, 0, 240) * 60_000,
    decayHours: numEnv("NEWS_DECAY_HOURS", 12, 0.5, 168),
    staleCutoffHours: numEnv("NEWS_STALE_HOURS", 48, 1, 720),
    fetchTimeoutMs: numEnv("NEWS_FETCH_TIMEOUT_MS", 6000, 1000, 30000),
    dedupePrefix: numEnv("NEWS_DEDUPE_PREFIX", 80, 10, 400),
    positive: listEnv("NEWS_POSITIVE_WORDS", DEFAULT_POSITIVE).map((w) => w.toLowerCase()),
    negative: listEnv("NEWS_NEGATIVE_WORDS", DEFAULT_NEGATIVE).map((w) => w.toLowerCase()),
    highImpact: listEnv("NEWS_HIGH_IMPACT_WORDS", DEFAULT_HIGH_IMPACT).map((w) => w.toLowerCase()),
    impactMediumScore: numEnv("NEWS_IMPACT_MEDIUM_SCORE", 2, 1, 20),
    impactWeights: { low: numEnv("NEWS_IMPACT_W_LOW", 1, 0), medium: numEnv("NEWS_IMPACT_W_MEDIUM", 1.8, 0), high: numEnv("NEWS_IMPACT_W_HIGH", 3, 0) },
    symbolMinKeywordLen: numEnv("NEWS_SYMBOL_MIN_KEYWORD_LEN", 3, 2, 10),
    strongRecency: numEnv("NEWS_STRONG_RECENCY", 0.4, 0, 1),
    missingWeight: numEnv("NEWS_MISSING_TIME_WEIGHT", 0.5, 0, 1),
  },
  vix: {
    symbols: listEnv("VIX_SYMBOLS", DEFAULT_VIX_SYMBOLS),
    thresholds: {
      low: numEnv("VIX_LOW_THRESHOLD", 13, 1, 100),
      normal: numEnv("VIX_NORMAL_THRESHOLD", 17, 1, 100),
      elevated: numEnv("VIX_HIGH_THRESHOLD", 22, 1, 100),
    },
    directionSensitivityPct: numEnv("VIX_DIRECTION_SENSITIVITY_PCT", 1.5, 0, 50),
    scoreByStatus: {
      low: numEnv("VIX_SCORE_LOW", 0.5, -1, 1),
      normal: numEnv("VIX_SCORE_NORMAL", 0.2, -1, 1),
      elevated: numEnv("VIX_SCORE_ELEVATED", -0.2, -1, 1),
      high: numEnv("VIX_SCORE_HIGH", -0.6, -1, 1),
    },
    directionAdj: { rising: numEnv("VIX_ADJ_RISING", -0.3, -1, 1), falling: numEnv("VIX_ADJ_FALLING", 0.3, -1, 1) },
    cacheMs: numEnv("VIX_CACHE_MS", 30_000, 0),
  },
  decision: {
    weights,
    biasThreshold: numEnv("INTEL_BIAS_THRESHOLD", 0.15, 0, 1),
    winThreshold: numEnv("INTEL_WIN_ESTIMATE_THRESHOLD", 75, 0, 100),
    minEnterConfidence: numEnv("INTEL_MIN_ENTER_CONFIDENCE", 75, 0, 100),
    strengthMag: { strong: numEnv("INTEL_STRENGTH_STRONG", 1, 0, 2), moderate: numEnv("INTEL_STRENGTH_MODERATE", 0.6, 0, 2), weak: numEnv("INTEL_STRENGTH_WEAK", 0.3, 0, 2) },
    techDirBlend: numEnv("INTEL_TECH_DIR_BLEND", 0.6, 0, 1),
    volConfirmedScore: numEnv("INTEL_VOL_CONFIRMED_SCORE", 0.4, 0, 1),
    volWeakScore: numEnv("INTEL_VOL_WEAK_SCORE", -0.15, -1, 0),
    newsBiasDivisor: numEnv("INTEL_NEWS_BIAS_DIVISOR", 3, 0.1, 100),
    confidence: {
      agreeBonus: numEnv("INTEL_CONF_AGREE_BONUS", 5, 0, 50),
      vixWeight: numEnv("INTEL_CONF_VIX_WEIGHT", 8, 0, 50),
      strongNegPenalty: numEnv("INTEL_CONF_STRONGNEG_PENALTY", 12, 0, 100),
      opposeNewsPenalty: numEnv("INTEL_CONF_OPPOSENEWS_PENALTY", 6, 0, 100),
      opposeNewsThreshold: numEnv("INTEL_CONF_OPPOSENEWS_THRESHOLD", 0.3, 0, 1),
      min: numEnv("INTEL_CONF_MIN", 0, 0, 100),
      max: numEnv("INTEL_CONF_MAX", 100, 0, 100),
    },
    breadth: {
      supportThreshold: numEnv("INTEL_BREADTH_SUPPORT_THRESHOLD", 0.1, 0, 1),
      cautionThreshold: numEnv("INTEL_BREADTH_CAUTION_THRESHOLD", 0.2, 0, 1),
      blockThreshold: numEnv("INTEL_BREADTH_BLOCK_THRESHOLD", 0.4, 0, 1),
    },
    newsOpposeThreshold: numEnv("INTEL_NEWS_OPPOSE_THRESHOLD", 0.4, 0, 1),
    newsSupportThreshold: numEnv("INTEL_NEWS_SUPPORT_THRESHOLD", 0.2, 0, 1),
  },
  movers: {
    equityUniverse: listEnv("MOVERS_EQUITY_UNIVERSE", DEFAULT_EQUITY_UNIVERSE),
    equityExchange: (process.env.MOVERS_EQUITY_EXCHANGE ?? "NSE").trim() || "NSE",
    scanLimit: numEnv("MOVERS_SCAN_LIMIT", 40, 1, 200),
    breadthCacheMs: numEnv("MOVERS_BREADTH_CACHE_MS", 60_000, 0),
  },
  kite: {
    tokenVerifySymbol: (process.env.KITE_TOKEN_VERIFY_SYMBOL ?? "NSE:INFY").trim() || "NSE:INFY",
    tokenVerifyCacheMs: numEnv("KITE_TOKEN_VERIFY_CACHE_MS", 20_000, 0),
  },
  // Refresh intervals (ms) — the backend owns them so frontend can read via /config/public.
  refresh: {
    liveSignalMs: numEnv("LIVE_SIGNAL_REFRESH_MS", 5_000, 1000),
    watchlistMs: numEnv("WATCHLIST_REFRESH_MS", 12_000, 1000),
    intelligenceMs: numEnv("INTELLIGENCE_REFRESH_MS", 45_000, 5000),
    topStripMs: numEnv("TOP_STRIP_REFRESH_MS", 10_000, 1000),
    vixMs: numEnv("VIX_REFRESH_MS", 60_000, 5000),
    kiteStatusMs: numEnv("KITE_STATUS_REFRESH_MS", 20_000, 5000),
  },
  defaults: {
    topStripSymbols: symbolListEnv("TOP_STRIP_DEFAULT_SYMBOLS", DEFAULT_TOP_STRIP),
    watchlistSymbols: symbolListEnv("WATCHLIST_DEFAULT_SYMBOLS", DEFAULT_WATCHLIST),
    benchmarkSymbols: listEnv("BENCHMARK_SYMBOLS", ["NSE:NIFTY 50", "NSE:NIFTY BANK"]),
    activeIndicators: listEnv("DEFAULT_ACTIVE_INDICATORS", DEFAULT_ACTIVE_INDICATORS),
    // Primary India VIX symbol for the client's best-effort volatility read.
    vixQuoteSymbol: listEnv("VIX_SYMBOLS", DEFAULT_VIX_SYMBOLS)[0],
  },
  // =====================================================================
  // Real-time DECISION LOOP config (state machine + specialised setup
  // detectors + regime + Chandelier exit + anti-flicker). EVERY threshold is
  // env-overridable — no magic numbers in the loop/detector services.
  // =====================================================================
  loop: {
    // Data-quality gate (STEP 2). Freshness cutoffs; if price/candles are stale
    // the engine must NOT emit ENTER.
    dataQuality: {
      quoteStaleSec: numEnv("LOOP_QUOTE_STALE_SEC", 90, 5, 3600),
      candleStaleIntervals: numEnv("LOOP_CANDLE_STALE_INTERVALS", 3, 1, 50), // × the timeframe
      minCandles: numEnv("LOOP_MIN_CANDLES", 30, 5, 500),
      warmupCandles: numEnv("LOOP_WARMUP_CANDLES", 50, 5, 1000),
    },
    // Market-regime classification (STEP 3).
    regime: {
      adxTrendMin: numEnv("LOOP_REGIME_ADX_TREND_MIN", 20, 5, 60),
      adxStrongMin: numEnv("LOOP_REGIME_ADX_STRONG_MIN", 32, 10, 80),
      atrExpansionPct: numEnv("LOOP_REGIME_ATR_EXPANSION_PCT", 25, 0, 200), // ATR now vs its recent avg
      atrLookback: numEnv("LOOP_REGIME_ATR_LOOKBACK", 20, 5, 200),
    },
    // Connors RSI mean-reversion setup (config-driven; no service-level literals).
    connors: {
      rsiPeriod: numEnv("LOOP_CRSI_RSI_PERIOD", 3, 2, 30),
      streakRsiPeriod: numEnv("LOOP_CRSI_STREAK_PERIOD", 2, 2, 30),
      rankPeriod: numEnv("LOOP_CRSI_RANK_PERIOD", 100, 10, 500),
      oversold: numEnv("LOOP_CRSI_OVERSOLD", 15, 1, 49),
      overbought: numEnv("LOOP_CRSI_OVERBOUGHT", 85, 51, 99),
      trendEmaPeriod: numEnv("LOOP_CRSI_TREND_EMA", 50, 5, 400),
      confirmCandles: numEnv("LOOP_CRSI_CONFIRM_CANDLES", 1, 0, 5),
    },
    // Chandelier Exit — EXIT/trailing management, not a primary entry (STEP/§6).
    chandelier: {
      atrPeriod: numEnv("LOOP_CE_ATR_PERIOD", 22, 2, 100),
      atrMult: numEnv("LOOP_CE_ATR_MULT", 3, 0.5, 10),
      useClose: flagEnv("LOOP_CE_USE_CLOSE", true), // highest close vs highest high
      confirmCandles: numEnv("LOOP_CE_CONFIRM_CANDLES", 1, 0, 5),
    },
    // Range Filter + HACOLT — SECONDARY confirmation only (§5C).
    rangeFilter: {
      period: numEnv("LOOP_RF_PERIOD", 20, 2, 200),
      mult: numEnv("LOOP_RF_MULT", 3, 0.5, 10),
    },
    hacolt: {
      emaPeriod: numEnv("LOOP_HACOLT_EMA_PERIOD", 55, 5, 400),
    },
    // Breakout / breakdown setup (§5D).
    breakout: {
      lookback: numEnv("LOOP_BREAKOUT_LOOKBACK", 20, 3, 200),
      volMult: numEnv("LOOP_BREAKOUT_VOL_MULT", 1.2, 1, 10), // volume vs its average
      atrBufferMult: numEnv("LOOP_BREAKOUT_ATR_BUFFER", 0.25, 0, 3), // trigger buffer past level
    },
    // Trade-quality gates (§11) — reused by every setup.
    safeZoneAtrMult: numEnv("LOOP_SAFE_ZONE_ATR_MULT", 0.6, 0, 5), // max ATRs past trigger still "safe"
    rrMin: numEnv("LOOP_RR_MIN", 1.5, 0.5, 10),
    // Anti-flicker / hysteresis (§19). Confirmations before a non-critical change,
    // a cooldown after EXIT/INVALIDATED, and a minimum dwell time per state.
    hysteresis: {
      minConfirmations: numEnv("LOOP_MIN_CONFIRMATIONS", 2, 1, 10),
      enterConfirmations: numEnv("LOOP_ENTER_CONFIRMATIONS", 2, 1, 10),
      cooldownMs: numEnv("LOOP_COOLDOWN_MS", 120_000, 0),
      minStateDurationMs: numEnv("LOOP_MIN_STATE_DURATION_MS", 15_000, 0),
      maxHistory: numEnv("LOOP_MAX_HISTORY", 40, 5, 500),
    },
    // Separate score weights for the exposed "combined confidence" breakdown.
    autoLock: flagEnv("LOOP_AUTO_LOCK", false), // fresh setups need explicit Lock unless true
    backtestMinSample: numEnv("LOOP_BACKTEST_MIN_SAMPLE", 30, 5, 1000),
  },
} as const;

export function isNewsEnabled(): boolean {
  return intelConfig.news.provider !== "disabled" && (intelConfig.news.provider === "newsapi" ? intelConfig.news.apiKey.length > 0 : intelConfig.news.rssUrls.length > 0);
}

/**
 * SAFE public config for the frontend (served at GET /api/config/public).
 * Includes ONLY client-consumable settings: refresh intervals, default
 * instruments, default indicator set, feature flags, approval thresholds and
 * labels. It deliberately EXCLUDES every secret/private value — no API keys, no
 * access tokens, no credentials, and no private feed (RSS) URLs.
 */
export function publicConfig() {
  return {
    refresh: intelConfig.refresh,
    defaults: {
      topStripSymbols: intelConfig.defaults.topStripSymbols,
      watchlistSymbols: intelConfig.defaults.watchlistSymbols,
      benchmarkSymbols: intelConfig.defaults.benchmarkSymbols,
      activeIndicators: intelConfig.defaults.activeIndicators,
      vixQuoteSymbol: intelConfig.defaults.vixQuoteSymbol,
    },
    features: {
      newsEnabled: isNewsEnabled(),
      intelligenceEnabled: true,
      newsProvider: intelConfig.news.provider,
    },
    labels: {
      readOnlyNotice: "Advisory market intelligence — read-only. No order placement, modification or execution.",
    },
    winThreshold: intelConfig.decision.winThreshold,
    minEnterConfidence: intelConfig.decision.minEnterConfidence,
    readOnly: true as const,
  };
}
export type PublicConfig = ReturnType<typeof publicConfig>;
