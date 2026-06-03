// Typed frontend API client for the backend.
//
// Backend base-URL resolution (in priority order):
//   1. NEXT_PUBLIC_API_BASE_URL — explicit override (production: Cloud Run).
//   2. NEXT_PUBLIC_BACKEND_URL — legacy override (kept for back-compat).
//   3. GitHub Codespaces auto-detect (browser only): the forwarded frontend URL
//      https://<name>-3000.app.github.dev  ->  https://<name>-4000.app.github.dev
//   4. localhost:4000 in dev; the deployed Cloud Run backend otherwise.
//
// The frontend talks to the BACKEND only. The AI engine stays backend-side
// (the backend calls it), so the browser never hits port 8000 directly.
// Live market data comes from the backend's read-only Kite integration.

import type {
  AccountSummaryResponse,
  ActiveTradeMonitor,
  AnalysisRequest,
  AnalysisResponse,
  BatchQuotesResponse,
  ChartDataResponse,
  HealthResponse,
  InstrumentResolveResponse,
  InstrumentsStatus,
  KiteLoginUrlResponse,
  KiteQuoteResponse,
  KiteStatus,
  LiveSignal,
  LiveTradePlan,
  MarketStatusResponse,
  PaperSummary,
  PaperTradeView,
  SearchResponse,
  TopMoversResponse,
  TradePlanRequest,
  TradePlanResponse,
} from "@/types/api";

export interface OpenPaperTradeBody {
  instrumentKey: string;
  displayName?: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  quantity?: number;
  lotSize?: number;
  lots?: number;
  stopLoss?: number | null;
  targets?: number[];
  notes?: string;
}

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
// Deployed Cloud Run backend — used as the production fallback so the static
// Firebase build always has a working API target even without an env var.
const CLOUD_RUN_BACKEND = "https://trade-analysis-backend-452185410229.asia-south1.run.app";

export function getBackendBaseUrl(): string {
  // 1) Explicit overrides win (NEXT_PUBLIC_API_BASE_URL preferred; legacy name kept).
  const envUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL)?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // 2) Auto-detect a GitHub Codespaces forwarded URL from the browser origin.
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin.includes(CODESPACES_FRONTEND_SUFFIX)) {
      return origin.replace(CODESPACES_FRONTEND_SUFFIX, CODESPACES_BACKEND_SUFFIX);
    }
    // 3) Local dev → local backend; any other host (e.g. Firebase) → Cloud Run.
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) return "http://localhost:4000";
    return CLOUD_RUN_BACKEND;
  }

  // 4) SSR/build-time fallback: the deployed backend.
  return CLOUD_RUN_BACKEND;
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
    quotes: (instruments: string[]) =>
      request<BatchQuotesResponse>(`/api/kite/quotes?instruments=${encodeURIComponent(instruments.join(","))}`),

    // Instruments resolver (Phase 3C/3D).
    instrumentsStatus: () => request<InstrumentsStatus>("/api/kite/instruments/status"),
    instrumentsRefresh: () =>
      request<InstrumentsStatus & { refreshed: boolean }>("/api/kite/instruments/refresh", { method: "POST" }),
    instrumentsSearch: (filters: {
      q?: string;
      segment?: string;
      instrumentType?: string;
      underlying?: string;
      expiry?: string;
      strike?: number | string;
      optionType?: string;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v != null && v !== "") qs.set(k, String(v));
      return request<SearchResponse>(`/api/kite/instruments/search?${qs.toString()}`);
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

  // Live market signal (Phase 3E/3F) — read-only: trend, probability, setups, P/L.
  liveSignal: (
    params: {
      instrument?: string;
      interval?: string;
      riskProfile?: string;
      activeIndicators?: string;
      quantity?: number;
    } & Partial<ResolveParams>,
  ) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
    return request<LiveSignal>(`/api/analysis/live-signal?${qs.toString()}`);
  },

  // Chart data (Phase 3F) — read-only candles + indicator series.
  chartData: (params: { instrument?: string; interval?: string; activeIndicators?: string } & Partial<ResolveParams>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
    return request<ChartDataResponse>(`/api/market/chart-data?${qs.toString()}`);
  },

  // Active trade monitor (Phase 3F) — read-only advisory.
  activeTradeMonitor: (params: {
    instrument: string;
    positionDirection: "LONG" | "SHORT";
    entryPrice: number;
    quantity: number;
    interval?: string;
    riskProfile?: string;
    activeIndicators?: string;
  }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
    return request<ActiveTradeMonitor>(`/api/analysis/active-trade-monitor?${qs.toString()}`);
  },

  // Market status (Phase 3G) — real NSE session state (no Kite needed).
  marketStatus: () => request<MarketStatusResponse>("/api/market/status"),

  // Top movers (Phase 3G) — read-only.
  topMovers: (segment: "equity" | "indices" | "futures" | "options") =>
    request<TopMoversResponse>(`/api/market/top-movers?segment=${segment}`),

  // Zerodha account (Phase 3G) — read-only; safe fallback when unavailable.
  account: {
    portfolioSummary: () => request<AccountSummaryResponse>("/api/kite/account/portfolio-summary"),
    holdings: () => request<{ source: string; holdings?: unknown[]; message?: string }>("/api/kite/account/holdings"),
    positions: () => request<{ source: string; positions?: unknown; message?: string }>("/api/kite/account/positions"),
  },

  // Paper trading (Phase 3G) — SIMULATED only; never places real orders.
  paper: {
    list: () => request<{ trades: PaperTradeView[]; disclaimer: string }>("/api/paper-trades"),
    summary: () => request<{ summary: PaperSummary; disclaimer: string }>("/api/paper-trades/summary"),
    open: (body: OpenPaperTradeBody) =>
      request<{ trade: PaperTradeView; disclaimer: string }>("/api/paper-trades/open", { method: "POST", body: JSON.stringify(body) }),
    close: (id: string, exitPrice?: number) =>
      request<{ trade: PaperTradeView }>("/api/paper-trades/close", { method: "POST", body: JSON.stringify({ id, exitPrice }) }),
    partialClose: (id: string, quantity: number, exitPrice?: number) =>
      request<{ trade: PaperTradeView }>("/api/paper-trades/partial-close", { method: "POST", body: JSON.stringify({ id, quantity, exitPrice }) }),
    reset: () => request<{ reset: boolean }>("/api/paper-trades/reset", { method: "DELETE" }),
  },
};
