// Typed frontend API client for the backend.
// Base URL comes from NEXT_PUBLIC_BACKEND_URL (see .env.local.example).
// All data is mock/demo in Phase 2.

import type {
  AnalysisRequest,
  AnalysisResponse,
  HealthResponse,
  TradePlanRequest,
  TradePlanResponse,
} from "@/types/api";

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const DEFAULT_TIMEOUT_MS = 8000;

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
  const url = `${BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new ApiError(
      timedOut ? "Request timed out." : "Cannot reach the backend. Is it running on " + BASE_URL + "?",
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
};
