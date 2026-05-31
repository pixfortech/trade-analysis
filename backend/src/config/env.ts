import dotenv from "dotenv";

dotenv.config();

/**
 * Centralised, typed access to environment variables.
 * Never hardcode secrets — read everything from the environment.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.BACKEND_PORT ?? 4000),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  aiEngineUrl: process.env.AI_ENGINE_URL ?? "http://localhost:8000",
  aiEngineTimeoutMs: Number(process.env.AI_ENGINE_TIMEOUT_MS ?? 4000),
  marketDataProvider: process.env.MARKET_DATA_PROVIDER ?? "mock",
} as const;

export const isProd = env.nodeEnv === "production";
