// Typed frontend API client for the backend.
//
// Backend base-URL resolution (in priority order):
//   1. NEXT_PUBLIC_BACKEND_URL — explicit override (see .env.local.example).
//   2. GitHub Codespaces auto-detect (browser only): the forwarded frontend URL
//      https://<name>-3000.app.github.dev  ->  https://<name>-4000.app.github.dev
//   3. http://localhost:4000 — normal local development.
//
// The frontend talks to the BACKEND only. The AI engine stays backend-side
// (the backend calls it), so the browser never hits port 8000 directly.
// All data is mock/demo in Phase 2.

import type {
  AnalysisRequest,
  AnalysisResponse,
  HealthResponse,
  InstrumentResolveResponse,
  InstrumentSearchResponse,
  InstrumentsStatus,
  KiteLoginUrlResponse,
  KiteQuoteResponse,
  KiteStatus,
  LiveTradePlan,
  TradePlanRequest,
  TradePlanResponse,
} from "@/types/api";

export interface ResolveParams {
  underlying: string;
  segment?: string;
  instrumentType: string;
  expiry?: string;
  strike?: number | string;
  optionType?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

// GitHub Codespaces forwards each port as a distinct subdomain, e.g.
// `glorious-train-abc123-3000.app.github.dev`. We swap the frontend port
// segment (-3000) for the backend port segment (-4000).
const CODESPACES_FRONTEND_SUFFIX = "-3000.app.github.dev";
const CODESPACES_BACKEND_SUFFIX = "-4000.app.github.dev";

/**
 * Resolve the backend base URL for the current environment.
 * Returns a URL with no trailing slash. Safe to call during SSR (falls back
 * to localhost when `window` is unavailable).
 */
export function getBackendBaseUrl(): string {
  // 1) Explicit override always wins.
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // 2) Auto-detect a GitHub Codespaces forwarded URL from the browser origin.
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes(CODESPACES_FRONTEND_SUFFIX)) {
      return origin.replace(CODESPACES_FRONTEND_SUFFIX, CODESPACES_BACKEND_SUFFIX);
    }
  }

  // 3) Local development fallback.
  return "http://localhost:4000";
}

/** Error thrown for any non-OK response or network/timeout failure. */
export class ApiError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getBackendBaseUrl();
  const url = `${baseUrl}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    if (timedOut) {
      throw new ApiError(`The backend at ${baseUrl} did not respond in time. Is it running on port 4000?`);
    }
    throw new ApiError(
      `Cannot reach the backend at ${baseUrl}. Make sure it is running on port 4000. ` +
        `In GitHub Codespaces, also ensure the port 4000 URL is forwarded and reachable.`,
    );
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const message = json?.error?.message ?? `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, json?.error?.code);
  }

  return json as T;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),

  tradePlan: (body: TradePlanRequest) =>
    request<TradePlanResponse>("/api/analysis/trade-plan", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  technical: (body: AnalysisRequest) =>
    request<AnalysisResponse>("/api/analysis/technical", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  futures: (body: AnalysisRequest) =>
    request<AnalysisResponse>("/api/analysis/futures", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  options: (body: AnalysisRequest) =>
    request<AnalysisResponse>("/api/analysis/options", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Zerodha Kite Connect — read-only (Phase 3A/3C).
  kite: {
    status: () => request<KiteStatus>("/api/kite/status"),
    loginUrl: () => request<KiteLoginUrlResponse>("/api/kite/login-url"),
    quote: (instrument: string) =>
      request<KiteQuoteResponse>(`/api/kite/quote?instrument=${encodeURIComponent(instrument)}`),

    // Instruments resolver (Phase 3C).
    instrumentsStatus: () => request<InstrumentsStatus>("/api/kite/instruments/status"),
    instrumentsRefresh: () =>
      request<InstrumentsStatus & { refreshed: boolean }>("/api/kite/instruments/refresh", { method: "POST" }),
    instrumentsSearch: (filters: { q?: string; segment?: string; instrumentType?: string; underlying?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v != null && v !== "") qs.set(k, String(v));
      return request<InstrumentSearchResponse>(`/api/kite/instruments/search?${qs.toString()}`);
    },
    instrumentsResolve: (params: ResolveParams) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
      return request<InstrumentResolveResponse>(`/api/kite/instruments/resolve?${qs.toString()}`);
    },
  },

  // Live trade-plan analysis (Phase 3B/3C) — read-only, Kite-based.
  // Accepts an exact instrument and/or resolver params (interval/riskProfile extra).
  liveTradePlan: (
    params: { instrument?: string; interval?: string; riskProfile?: string } & Partial<ResolveParams>,
  ) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
    return request<LiveTradePlan>(`/api/analysis/live-trade-plan?${qs.toString()}`);
  },
};
