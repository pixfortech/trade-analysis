import dotenv from "dotenv";

dotenv.config();

/** Robust boolean env parse: trims whitespace, case-insensitive "true". */
export function envFlag(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  return value.trim().toLowerCase() === "true";
}

/**
 * Centralised, typed access to environment variables.
 * Never hardcode secrets — read everything from the environment.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  // Cloud Run injects PORT; prefer it, then BACKEND_PORT, then local default.
  port: Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  aiEngineUrl: process.env.AI_ENGINE_URL ?? "http://localhost:8000",
  aiEngineTimeoutMs: Number(process.env.AI_ENGINE_TIMEOUT_MS ?? 4000),
  marketDataProvider: process.env.MARKET_DATA_PROVIDER ?? "mock",

  /**
   * Zerodha Kite Connect (Phase 3A — READ-ONLY live market data).
   * apiSecret and accessToken are SERVER-SIDE ONLY and must never be sent to
   * the frontend or logged. apiKey is public (it appears in the login URL).
   */
  kite: {
    apiKey: (process.env.KITE_API_KEY ?? "").trim(),
    apiSecret: (process.env.KITE_API_SECRET ?? "").trim(),
    // Optional: a pre-obtained access token (otherwise set via the login flow).
    accessToken: (process.env.KITE_ACCESS_TOKEN ?? "").trim(),
    redirectUrl: (process.env.KITE_REDIRECT_URL ?? "").trim(),
    // Robust parse — tolerates whitespace/casing from env-var tooling.
    enableLiveData: envFlag(process.env.KITE_ENABLE_LIVE_DATA, false),
    // Overridable base URLs (handy for tests); default to Kite's real hosts.
    loginBase: process.env.KITE_LOGIN_BASE ?? "https://kite.zerodha.com/connect/login",
    apiBase: process.env.KITE_API_BASE ?? "https://api.kite.trade",
    // Instruments cache TTL (hours) before an auto-refresh is attempted.
    instrumentsTtlHours: Number(process.env.KITE_INSTRUMENTS_TTL_HOURS ?? 24),
  },

  /**
   * News ingestion (server-side only) for the market-intelligence layer.
   * Defaults to public Indian-markets RSS feeds (no key needed); override with
   * NEWS_RSS_URLS (comma-separated) or add a NewsAPI key. Graceful fallback:
   * if nothing resolves, the API reports News unavailable (never fabricated).
   */
  news: {
    apiKey: (process.env.NEWS_API_KEY ?? "").trim(),
    rssUrls: (process.env.NEWS_RSS_URLS ??
      [
        "https://www.moneycontrol.com/rss/marketreports.xml",
        "https://www.moneycontrol.com/rss/business.xml",
        "https://www.business-standard.com/rss/markets-106.rss",
        "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
      ].join(","))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    cacheMinutes: Number(process.env.NEWS_CACHE_MINUTES ?? 5),
    maxItems: Number(process.env.NEWS_MAX_ITEMS ?? 30),
    // News older than this many hours decays to ~zero weight in scoring.
    decayHours: Number(process.env.NEWS_DECAY_HOURS ?? 12),
  },
} as const;

export const isProd = env.nodeEnv === "production";
