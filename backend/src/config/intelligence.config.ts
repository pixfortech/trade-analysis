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

/** "KEY=VALUE,KEY=VALUE" → record, merged over `def`. Keys are upper-cased. */
function mapEnv(name: string, def: Record<string, string>): Record<string, string> {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return { ...def };
  const out = { ...def };
  for (const pair of raw.split(",")) {
    const [k, v] = pair.split("=");
    if (k && v) out[k.trim().toUpperCase()] = v.trim();
  }
  return out;
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
    // Instrument-relevance gate. A headline must score at/above minDecisionScore
    // (DIRECT_INSTRUMENT / UNDERLYING / SECTOR) to affect the news score,
    // supporting/blocking factors or entry/exit — BENCHMARK/MACRO/MARKET_WIDE
    // are context-only. Below minDisplayScore it is omitted entirely.
    relevance: {
      // Thresholds. Decision-impact: only ≥ minDecisionScore (DIRECT/UNDERLYING/
      // SECTOR) affects score/blockers. Context-only band: minDisplayScore..
      // minDecisionScore. minDirectScore is the "directly relevant" cutoff used
      // by newsDecisionImpact.directRelevantCount.
      minDecisionScore: numEnv("NEWS_MIN_DECISION_RELEVANCE", 55, 0, 100),
      minDisplayScore: numEnv("NEWS_MIN_DISPLAY_RELEVANCE", 25, 0, 100),
      minDirectScore: numEnv("NEWS_MIN_DIRECT_RELEVANCE", 80, 0, 100),
      scores: {
        direct: numEnv("NEWS_RELEVANCE_DIRECT_SCORE", 95, 0, 100),
        underlying: numEnv("NEWS_RELEVANCE_UNDERLYING_SCORE", 85, 0, 100),
        sector: numEnv("NEWS_RELEVANCE_SECTOR_SCORE", 60, 0, 100),
        benchmark: numEnv("NEWS_RELEVANCE_BENCHMARK_SCORE", 40, 0, 100),
        macro: numEnv("NEWS_RELEVANCE_MACRO_SCORE", 32, 0, 100),
        marketWide: numEnv("NEWS_RELEVANCE_MARKET_SCORE", 28, 0, 100),
        irrelevant: numEnv("NEWS_RELEVANCE_IRRELEVANT_SCORE", 0, 0, 100),
      },
      // Tie/order priorities for ranking relevant headlines (higher = first).
      priorities: {
        direct: numEnv("NEWS_PRIORITY_DIRECT", 6, 0, 100),
        underlying: numEnv("NEWS_PRIORITY_UNDERLYING", 5, 0, 100),
        sector: numEnv("NEWS_PRIORITY_SECTOR", 4, 0, 100),
        benchmark: numEnv("NEWS_PRIORITY_BENCHMARK", 3, 0, 100),
        marketWide: numEnv("NEWS_PRIORITY_MARKET_WIDE", 2, 0, 100),
        macro: numEnv("NEWS_PRIORITY_MACRO", 2, 0, 100),
        irrelevant: numEnv("NEWS_PRIORITY_IRRELEVANT", 0, 0, 100),
      },
    },
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
    scanLimit: numEnv("MOVERS_SCAN_LIMIT", 40, 1, 400),
    breadthCacheMs: numEnv("MOVERS_BREADTH_CACHE_MS", 60_000, 0),
    resultsLimit: numEnv("MOVERS_RESULTS_LIMIT", 10, 1, 50),
    // Liquidity / quality filters applied BEFORE sorting (0 = off). Options add
    // their own, tighter defaults below (low-premium contracts must not dominate).
    minLtp: numEnv("MOVERS_MIN_LTP", 0, 0),
    minVolume: numEnv("MOVERS_MIN_VOLUME", 0, 0),
    minOi: numEnv("MOVERS_MIN_OI", 0, 0),
    maxSpreadPct: numEnv("MOVERS_MAX_SPREAD_PCT", 100, 0, 100),
    maxQuoteAgeSec: numEnv("MOVERS_MAX_QUOTE_AGE_SEC", 0, 0), // 0 = don't age-filter
    // A near-zero previous close makes %change explode (±hundreds%). Exclude those.
    excludeNearZeroPrevClose: flagEnv("MOVERS_EXCLUDE_NEAR_ZERO_PREVCLOSE", true),
    nearZeroPrevClose: numEnv("MOVERS_NEAR_ZERO_PREVCLOSE", 1, 0),
    options: {
      underlyings: listEnv("MOVERS_OPTION_UNDERLYINGS", ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]).map((s) => s.toUpperCase()),
      minLtp: numEnv("OPTIONS_MOVERS_MIN_LTP", 2, 0),
      minVolume: numEnv("OPTIONS_MOVERS_MIN_VOLUME", 0, 0),
      minOi: numEnv("OPTIONS_MOVERS_MIN_OI", 0, 0),
      maxSpreadPct: numEnv("OPTIONS_MOVERS_MAX_SPREAD_PCT", 25, 0, 100),
      strikeRange: numEnv("OPTIONS_MOVERS_STRIKE_RANGE", 0, 0), // 0 = off (ATM range needs spot)
      expiryMode: enumEnv("OPTIONS_MOVERS_EXPIRY_MODE", "nearest", ["nearest", "current"] as const),
      sortField: enumEnv("OPTIONS_MOVERS_SORT_FIELD", "percent", ["percent", "absolute", "volume", "oi"] as const),
      maxResults: numEnv("OPTIONS_MOVERS_MAX_RESULTS", 10, 1, 50),
    },
  },
  // Live options-chain construction (from the Kite instrument catalogue + batched
  // quotes). Bounded around ATM; rate-limit-safe batching.
  optionsChain: {
    defaultStrikes: numEnv("OPTIONS_CHAIN_STRIKES", 12, 2, 60), // strikes each side of ATM
    maxContracts: numEnv("OPTIONS_CHAIN_MAX_CONTRACTS", 80, 4, 400),
    quoteBatchSize: numEnv("OPTIONS_CHAIN_BATCH_SIZE", 200, 10, 500),
    cacheMs: numEnv("OPTIONS_CHAIN_CACHE_MS", 5_000, 0),
    // Underlying → live spot instrument key (for ATM/spot). Equity underlyings not
    // listed fall back to NSE:<underlying>. Override via OPTIONS_SPOT_SYMBOLS.
    spotSymbols: mapEnv("OPTIONS_SPOT_SYMBOLS", { NIFTY: "NSE:NIFTY 50", BANKNIFTY: "NSE:NIFTY BANK", FINNIFTY: "NSE:NIFTY FIN SERVICE", MIDCPNIFTY: "NSE:NIFTY MIDCAP SELECT", SENSEX: "BSE:SENSEX" }),
  },
  kite: {
    tokenVerifySymbol: (process.env.KITE_TOKEN_VERIFY_SYMBOL ?? "NSE:INFY").trim() || "NSE:INFY",
    tokenVerifyCacheMs: numEnv("KITE_TOKEN_VERIFY_CACHE_MS", 20_000, 0),
  },
  // Refresh intervals (ms) — the backend owns them so frontend can read via /config/public.
  // These are the layered pipeline: liveSignalMs = FAST (CMP/quote), intelligenceMs
  // = SLOW (VIX/news/breadth). Medium (candles/decision) uses liveSignalMs too.
  refresh: {
    liveSignalMs: numEnv("LIVE_SIGNAL_REFRESH_MS", 5_000, 1000),
    watchlistMs: numEnv("WATCHLIST_REFRESH_MS", 12_000, 1000),
    intelligenceMs: numEnv("INTELLIGENCE_REFRESH_MS", 45_000, 5000),
    topStripMs: numEnv("TOP_STRIP_REFRESH_MS", 10_000, 1000),
    vixMs: numEnv("VIX_REFRESH_MS", 60_000, 5000),
    kiteStatusMs: numEnv("KITE_STATUS_REFRESH_MS", 20_000, 5000),
  },
  // Market-session model (config-driven — no scattered NSE times in code). Minutes
  // are minutes-since-IST-midnight: 09:15 = 555, 15:30 = 930, pre-open 09:00 = 540.
  session: {
    timezone: (process.env.MARKET_TIMEZONE ?? "Asia/Kolkata").trim() || "Asia/Kolkata",
    openMinutes: numEnv("MARKET_OPEN_MINUTES", 555, 0, 1439),
    closeMinutes: numEnv("MARKET_CLOSE_MINUTES", 930, 0, 1439),
    preopenMinutes: numEnv("MARKET_PREOPEN_MINUTES", 540, 0, 1439),
  },
  // Real-time stream (tick reconnect + polling fallback + freshness) and the
  // timestamp display preference — all config-driven.
  stream: {
    tickReconnectMs: numEnv("TICK_RECONNECT_MS", 5_000, 500),
    pollingFallbackMs: numEnv("POLLING_FALLBACK_MS", 5_000, 1000),
    quoteStaleSec: numEnv("STREAM_QUOTE_STALE_SEC", 90, 5, 3600),
    showMillis: flagEnv("MARKET_TIME_SHOW_MILLIS", true),
    // --- Kite WebSocket ticker → SSE relay (real-time source of truth) ---
    // Master switch. When on AND Kite is live+authenticated, the ticker becomes
    // the CMP/index source and REST polling is the fallback only.
    wsEnabled: flagEnv("STREAM_WS_ENABLED", true),
    wsUrl: (process.env.KITE_WS_URL ?? "wss://ws.kite.trade").trim() || "wss://ws.kite.trade",
    wsMode: enumEnv("STREAM_WS_MODE", "full", ["ltp", "quote", "full"] as const), // full ⇒ exchange timestamp + OHLC
    reconnectBaseMs: numEnv("STREAM_RECONNECT_BASE_MS", 2_000, 500),
    reconnectMaxMs: numEnv("STREAM_RECONNECT_MAX_MS", 30_000, 1000),
    heartbeatTimeoutMs: numEnv("STREAM_HEARTBEAT_TIMEOUT_MS", 7_500, 2000), // no frame within ⇒ reconnect
    maxSubscriptions: numEnv("STREAM_MAX_SUBSCRIPTIONS", 3000, 1, 3000),
    // A tick older than this (by RECEIPT time) is stale → fresh entry blocked and
    // the client falls back to REST. Finer than quoteStaleSec (the coarse gate).
    tickStaleMs: numEnv("STREAM_TICK_STALE_MS", 5_000, 500),
    sseKeepaliveMs: numEnv("STREAM_SSE_KEEPALIVE_MS", 15_000, 1000),
    // Tick-built live candles: once a subscribed instrument is streaming, indicators
    // and the decision read the tick-built candle series instead of re-fetching
    // historical REST candles (§4/§7). REST seeds it once; ticks extend it. Falls
    // back to REST whenever the series is cold (no tick within candleWarmMs).
    candlesFromTicks: flagEnv("STREAM_CANDLES_FROM_TICKS", true),
    candleWarmMs: numEnv("STREAM_CANDLE_WARM_MS", 15_000, 1000),
    candleMaxCount: numEnv("STREAM_CANDLE_MAX_COUNT", 500, 50, 5000),
    // Real-time decision stream: minimum interval (ms) between coalesced decision
    // emits per session. An ACTION transition (e.g. WAIT→ENTER, hard stop) always
    // emits immediately regardless — this only throttles no-change ticks.
    decisionMinIntervalMs: numEnv("STREAM_DECISION_MIN_INTERVAL_MS", 250, 0, 5000),
    decisionEnabled: flagEnv("STREAM_DECISION_ENABLED", true),
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
  // =====================================================================
  // TRADE PREVIEW config — Tentative P/L, conservative safe-exit, position
  // sizing, cost model and the ENTER-transition alert. Read-only/advisory:
  // these drive an ESTIMATE only, never any order. Every value env-overridable.
  // =====================================================================
  trade: {
    // Position sizing. Real lot size always comes from the instrument catalogue;
    // this is only the DEFAULT number of lots when the user hasn't chosen.
    defaultLots: numEnv("TRADE_DEFAULT_LOTS", 1, 1, 10_000),
    // Conservative safe-exit derivation (booking a realistic partial before the
    // full target). Distance from entry toward Target-1, in ATRs, clamped so the
    // safe-exit is NEVER beyond Target-1 and never trivially small.
    safeExit: {
      atrMult: numEnv("TRADE_SAFE_EXIT_ATR_MULT", 1, 0, 10),
      minSpanFraction: numEnv("TRADE_SAFE_EXIT_MIN_SPAN_FRACTION", 0.25, 0.01, 1),
      maxSpanFraction: numEnv("TRADE_SAFE_EXIT_MAX_SPAN_FRACTION", 0.95, 0.05, 1),
      structureBufferPct: numEnv("TRADE_SAFE_EXIT_STRUCT_BUFFER_PCT", 0.05, 0, 5), // % of price kept before S/R
    },
    // Trading-cost model. OFF by default — while disabled the preview shows GROSS
    // only and labels net "unavailable until trading costs are configured" (never
    // presents a gross figure as net). All rates env-overridable when enabled.
    costs: {
      enabled: flagEnv("TRADE_COSTS_ENABLED", false),
      brokeragePerOrder: numEnv("TRADE_COST_BROKERAGE_PER_ORDER", 20, 0), // ₹ flat per order leg
      orderLegs: numEnv("TRADE_COST_ORDER_LEGS", 2, 1, 4), // entry + exit
      taxesPctOfTurnover: numEnv("TRADE_COST_TAXES_PCT_TURNOVER", 0.05, 0, 5), // STT+exch+GST+stamp approx, % of turnover
    },
    // PREPARE / GET-READY pre-entry proximity (§2). CMP within ANY of these of the
    // preferred entry (whichever is larger) → GET READY, provided the setup is
    // still valid. Config-driven; supports points, % of price and ATR-relative.
    prepare: {
      points: numEnv("TRADE_PREPARE_POINTS", 12, 0),
      pct: numEnv("TRADE_PREPARE_PCT", 0.08, 0, 5), // % of CMP
      atrMult: numEnv("TRADE_PREPARE_ATR_MULT", 0.5, 0, 5),
    },
    // Late-entry gate (§4A/§4B). Above the preferred zone, continuation is allowed
    // only while the REMAINING reward/risk (recomputed from the CURRENT price) is
    // at least this; below it → WAIT FOR PULLBACK.
    lateEntryMinRR: numEnv("TRADE_LATE_ENTRY_MIN_RR", 1.2, 0, 20),
    // Evidence-freshness gate (§15). Fresh ENTER requires the APPROVAL EVIDENCE
    // (indicators/decision), not just CMP, to be newer than this. Older ⇒ block
    // fresh entry even while CMP keeps ticking (never a false "LIVE" approval).
    evidenceStaleMs: numEnv("TRADE_EVIDENCE_STALE_MS", 20_000, 1000),
    // ENTER-transition alert (WAIT → ENTER). Config-driven cooldown + sound flag;
    // per-session dedupe lives in the client.
    alerts: {
      enterCooldownMs: numEnv("TRADE_ALERT_ENTER_COOLDOWN_MS", 60_000, 0),
      soundEnabled: flagEnv("TRADE_ALERT_SOUND_ENABLED", true),
    },
    // Continuation guard (§12): when CMP runs beyond the entry zone in the trade
    // direction, how far (in ATRs) a continuation entry is still allowed before it
    // becomes "reversal risk / wait for pullback".
    continuationAtrMult: numEnv("TRADE_CONTINUATION_ATR_MULT", 0.75, 0, 5),
    // Plan-staleness HINT threshold. When the live tick has moved this % past the
    // analysed price, the locked levels are flagged "Plan no longer optimal —
    // Re-analyse recommended". This NEVER moves the locked Entry/SL/Targets or
    // auto-regenerates the plan — it only prompts an explicit Re-analyse. The
    // live approval/action still recompute every tick against the LOCKED plan.
    planStaleMovePct: numEnv("TRADE_PLAN_STALE_MOVE_PCT", 0.35, 0, 20),
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
    // Market-session + timestamp-format + stream cadence — safe, client-consumable.
    session: {
      timezone: intelConfig.session.timezone,
      openMinutes: intelConfig.session.openMinutes,
      closeMinutes: intelConfig.session.closeMinutes,
      preopenMinutes: intelConfig.session.preopenMinutes,
    },
    stream: {
      tickReconnectMs: intelConfig.stream.tickReconnectMs,
      pollingFallbackMs: intelConfig.stream.pollingFallbackMs,
      quoteStaleSec: intelConfig.stream.quoteStaleSec,
      showMillis: intelConfig.stream.showMillis,
      // Client-relevant streaming settings (no secrets): whether to open the SSE
      // tick stream, the tick freshness gate, and the SSE keepalive cadence.
      wsEnabled: intelConfig.stream.wsEnabled,
      tickStaleMs: intelConfig.stream.tickStaleMs,
      sseKeepaliveMs: intelConfig.stream.sseKeepaliveMs,
      decisionEnabled: intelConfig.stream.decisionEnabled,
      decisionMinIntervalMs: intelConfig.stream.decisionMinIntervalMs,
    },
    winThreshold: intelConfig.decision.winThreshold,
    minEnterConfidence: intelConfig.decision.minEnterConfidence,
    // Trade-preview settings the client needs to compute the live Tentative P/L,
    // safe-exit and ENTER alert. Cost RATES are exposed ONLY as a flag + rates so
    // the client can compute net when enabled; no secrets here.
    trade: {
      defaultLots: intelConfig.trade.defaultLots,
      safeExit: {
        atrMult: intelConfig.trade.safeExit.atrMult,
        minSpanFraction: intelConfig.trade.safeExit.minSpanFraction,
        maxSpanFraction: intelConfig.trade.safeExit.maxSpanFraction,
        structureBufferPct: intelConfig.trade.safeExit.structureBufferPct,
      },
      costs: {
        enabled: intelConfig.trade.costs.enabled,
        brokeragePerOrder: intelConfig.trade.costs.brokeragePerOrder,
        orderLegs: intelConfig.trade.costs.orderLegs,
        taxesPctOfTurnover: intelConfig.trade.costs.taxesPctOfTurnover,
      },
      alerts: {
        enterCooldownMs: intelConfig.trade.alerts.enterCooldownMs,
        soundEnabled: intelConfig.trade.alerts.soundEnabled,
      },
      continuationAtrMult: intelConfig.trade.continuationAtrMult,
      planStaleMovePct: intelConfig.trade.planStaleMovePct,
      prepare: intelConfig.trade.prepare,
      lateEntryMinRR: intelConfig.trade.lateEntryMinRR,
      evidenceStaleMs: intelConfig.trade.evidenceStaleMs,
    },
    readOnly: true as const,
  };
}
export type PublicConfig = ReturnType<typeof publicConfig>;
