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

// Zerodha Kite Connect — Phase 3A (read-only). Status is secret-free.
export interface KiteStatus {
  provider: "zerodha-kite";
  liveDataEnabled: boolean;
  configured: boolean;
  authenticated: boolean;
  readOnly: true;
  mode: "live" | "disabled";
  message: string;
  notice?: string;
}

export interface KiteLoginUrlResponse {
  loginUrl: string;
  readOnly: true;
}

export interface KiteQuoteResponse {
  source: "kite";
  live: true;
  readOnly: true;
  instrument: string;
  data: Record<string, unknown>;
}

// Zerodha-like grouped search (Phase 3D).
export type UiSegment = "equity" | "indices" | "futures" | "options";

export interface InstrumentResult {
  instrument: string;
  instrumentToken: number;
  exchange: string;
  tradingsymbol: string;
  name: string;
  displayName: string;
  segment: string;
  uiSegment: UiSegment;
  instrumentType: "EQ" | "INDEX" | "FUT" | "CE" | "PE";
  expiry: string;
  strike: number;
  optionType: string;
  lotSize: number;
}

export interface SearchResponse {
  readOnly: true;
  query: string;
  cache: { ready: boolean; lastUpdated: string | null; expiresAt: string | null; count: number };
  groups: {
    equity: InstrumentResult[];
    indices: InstrumentResult[];
    futures: InstrumentResult[];
    options: InstrumentResult[];
  };
  message: string;
}

export interface BatchQuotesResponse {
  source: "kite";
  live: true;
  readOnly: true;
  requested: string[];
  missing: string[];
  data: Record<string, { last_price?: number; net_change?: number; ohlc?: { close?: number } }>;
}

// Kite instruments resolver (Phase 3C).
export interface InstrumentCandidate {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  tradingsymbol: string;
  name: string;
  exchange: string;
  instrumentType: string; // EQ | FUT | CE | PE
  expiry: string;
  strike: number;
  lotSize: number;
  instrumentToken: number;
}

export interface InstrumentsStatus {
  loaded: boolean;
  count: number;
  loadedAt: string | null;
  source: "kite" | null;
  byExchange: Record<string, number>;
  readOnly: true;
}

export interface InstrumentSearchResponse {
  readOnly: true;
  count: number;
  results: InstrumentCandidate[];
}

export interface InstrumentResolveResponse {
  readOnly: true;
  resolved: InstrumentCandidate | null;
  candidates: InstrumentCandidate[];
  message: string;
}

// Live Trade Plan (Phase 3B) — read-only Kite-based analysis.
export type LiveAction = "LONG" | "SHORT" | "WAIT" | "AVOID" | "RANGE-BOUND";

export interface LivePlanSide {
  entryAbove?: number;
  entryBelow?: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: string;
  condition: string;
}

export interface LiveTradePlan {
  instrument: string;
  source: "kite";
  live: true;
  readOnly: true;
  timestamp: string;
  dataQuality: "live-historical" | "live-quote-only";
  dataNote: string;
  currentPrice: number;
  previousClose: number;
  marketData: { open: number; high: number; low: number; close: number; volume: number };
  indicators: {
    ema9: number | null;
    ema20: number | null;
    vwap: number | null;
    rsi: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    atr: number | null;
    volumeConfirmed: boolean | null;
  };
  trend: { direction: "bullish" | "bearish" | "sideways"; strength: "weak" | "medium" | "strong"; reason: string };
  levels: { support1: number; support2: number; resistance1: number; resistance2: number };
  longPlan: LivePlanSide;
  shortPlan: LivePlanSide;
  finalDecision: { action: LiveAction; confidence: "low" | "medium" | "high"; reason: string };
  riskDisclaimer: string;
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
