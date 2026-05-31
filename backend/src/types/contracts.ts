// Shared API response contracts (backend ↔ AI engine ↔ frontend).
// JSON is camelCase across all three services. These types describe the
// Phase 2 placeholder payloads — data is mock/demo until authorised live
// market data is integrated in a later phase.

export type Signal = "bullish" | "bearish" | "neutral";
export type Action = "BUY" | "SELL" | "HOLD";

/**
 * Where an analysis payload came from:
 *  - "ai-engine"     → produced by the Python AI engine
 *  - "mock"          → produced directly by the AI engine's mock logic
 *  - "mock-fallback" → AI engine was unreachable; backend served local mock
 */
export type AnalysisSource = "ai-engine" | "mock" | "mock-fallback";

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
