// API response/request contracts mirrored from the backend.
// JSON is camelCase across frontend, backend and AI engine.
// Phase 2: payloads are mock/demo data.

import type { Action, Signal } from "@/types";

export type AnalysisSource = "ai-engine" | "mock" | "mock-fallback";

export interface HealthResponse {
  status: string;
  service: string;
  uptime?: number;
  timestamp?: string;
}

export interface TradePlanRequest {
  symbol: string;
  segment?: string;
  capital?: number;
  riskPercent?: number;
}

export interface TradePlanResponse {
  source: AnalysisSource;
  demo: boolean;
  symbol: string;
  segment: string;
  action: Action;
  signal: Signal;
  confidence: number;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  riskReward: number | null;
  rationale: string[];
  disclaimer: string;
}

export interface AnalysisRequest {
  symbol: string;
  segment?: string;
  interval?: string;
  expiry?: string;
}

export interface AnalysisResponse {
  source: AnalysisSource;
  demo: boolean;
  symbol: string;
  segment: string;
  signal: Signal;
  score: number;
  notes: string[];
  metrics: Record<string, unknown>;
  disclaimer: string;
}
