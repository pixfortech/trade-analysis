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
} as const;

export const isProd = env.nodeEnv === "production";
