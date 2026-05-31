// Shared TypeScript types for the dashboard.
// NOTE (Phase 1): these describe the *shape* of mock data used for UI demo.
// They will align with the backend/AI-engine API contracts in later phases.

export type Signal = "bullish" | "bearish" | "neutral";
export type Action = "BUY" | "SELL" | "HOLD";

export type Segment =
  | "Equity"
  | "Stock Future"
  | "Index Future"
  | "Stock Option"
  | "Index Option";

export interface MarketIndex {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePercent: number;
  spark: number[];
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  segment: Segment;
  ltp: number;
  change: number;
  changePercent: number;
}

export interface TradeRecommendation {
  symbol: string;
  segment: Segment;
  action: Action;
  signal: Signal;
  confidence: number; // 0..100
  entry: number;
  stopLoss: number;
  target: number;
  riskReward: number;
  rationale: string[];
}

export interface FuturesRow {
  symbol: string;
  expiry: string;
  ltp: number;
  basis: number;
  oiChangePercent: number;
  interpretation: string; // e.g. "Long Buildup"
  signal: Signal;
}

export interface OptionStrike {
  strike: number;
  callOI: number; // in lots/contracts (mock)
  putOI: number;
  isATM?: boolean;
}

export interface OptionsSummary {
  symbol: string;
  expiry: string;
  spot: number;
  pcr: number;
  maxPain: number;
  support: number[];
  resistance: number[];
  signal: Signal;
  chain: OptionStrike[];
}

export interface TradePlan {
  symbol: string;
  segment: Segment;
  action: Action;
  signal: Signal;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: number;
  notes: string[];
}

export interface RiskMetrics {
  capital: number;
  riskPercent: number;
  riskAmount: number;
  perUnitRisk: number;
  positionSize: number;
  riskReward: number;
}

export interface SentimentGauge {
  label: string;
  value: number; // 0..100
  signal: Signal;
}

export interface ScannerRow {
  symbol: string;
  segment: Segment;
  setup: string;
  ltp: number;
  changePercent: number;
  signal: Signal;
}
