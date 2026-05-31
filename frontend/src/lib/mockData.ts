// =====================================================================
// MOCK / PLACEHOLDER DATA — Phase 1 (UI demonstration only)
// ---------------------------------------------------------------------
// This is NOT real market data. It is static sample data used to render
// the dashboard. In later phases this will be replaced by API calls to
// the backend, which sources authorised live market data + AI analysis.
// =====================================================================

import type {
  FuturesRow,
  MarketIndex,
  OptionsSummary,
  RiskMetrics,
  ScannerRow,
  SentimentGauge,
  TradePlan,
  TradeRecommendation,
  WatchlistItem,
} from "@/types";

export const marketIndices: MarketIndex[] = [
  {
    symbol: "NIFTY",
    name: "Nifty 50",
    ltp: 21512.3,
    change: 132.45,
    changePercent: 0.62,
    spark: [21380, 21410, 21395, 21440, 21470, 21455, 21490, 21512],
  },
  {
    symbol: "BANKNIFTY",
    name: "Bank Nifty",
    ltp: 46218.75,
    change: -184.2,
    changePercent: -0.4,
    spark: [46420, 46380, 46350, 46300, 46260, 46280, 46240, 46219],
  },
  {
    symbol: "FINNIFTY",
    name: "Fin Nifty",
    ltp: 20985.1,
    change: 96.8,
    changePercent: 0.46,
    spark: [20880, 20905, 20890, 20930, 20950, 20940, 20970, 20985],
  },
  {
    symbol: "SENSEX",
    name: "BSE Sensex",
    ltp: 71284.6,
    change: 421.3,
    changePercent: 0.59,
    spark: [70850, 70920, 70980, 71040, 71120, 71180, 71240, 71285],
  },
];

export const watchlist: WatchlistItem[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", segment: "Equity", ltp: 2945.5, change: 18.2, changePercent: 0.62 },
  { symbol: "HDFCBANK", name: "HDFC Bank", segment: "Equity", ltp: 1678.3, change: -9.4, changePercent: -0.56 },
  { symbol: "INFY", name: "Infosys", segment: "Equity", ltp: 1542.0, change: 22.7, changePercent: 1.49 },
  { symbol: "TCS", name: "Tata Consultancy", segment: "Equity", ltp: 3890.15, change: -12.6, changePercent: -0.32 },
  { symbol: "NIFTY FUT", name: "Nifty Jan Fut", segment: "Index Future", ltp: 21548.0, change: 140.0, changePercent: 0.65 },
  { symbol: "BANKNIFTY FUT", name: "Bank Nifty Jan Fut", segment: "Index Future", ltp: 46290.0, change: -160.0, changePercent: -0.34 },
];

export const aiRecommendation: TradeRecommendation = {
  symbol: "RELIANCE",
  segment: "Equity",
  action: "BUY",
  signal: "bullish",
  confidence: 72,
  entry: 2945,
  stopLoss: 2905,
  target: 3025,
  riskReward: 2.0,
  rationale: [
    "Placeholder rationale — momentum + trend filter (mock).",
    "Price reclaimed 20-EMA with rising volume (mock).",
    "Sector breadth supportive (mock).",
  ],
};

export const futuresRows: FuturesRow[] = [
  { symbol: "NIFTY", expiry: "29 Jan", ltp: 21548, basis: 35.7, oiChangePercent: 5.1, interpretation: "Long Buildup", signal: "bullish" },
  { symbol: "BANKNIFTY", expiry: "29 Jan", ltp: 46290, basis: 71.3, oiChangePercent: -3.4, interpretation: "Long Unwinding", signal: "bearish" },
  { symbol: "RELIANCE", expiry: "29 Jan", ltp: 2951, basis: 5.5, oiChangePercent: 8.2, interpretation: "Long Buildup", signal: "bullish" },
  { symbol: "TCS", expiry: "29 Jan", ltp: 3894, basis: 3.9, oiChangePercent: 6.7, interpretation: "Short Buildup", signal: "bearish" },
];

export const optionsSummary: OptionsSummary = {
  symbol: "NIFTY",
  expiry: "29 Jan",
  spot: 21512,
  pcr: 0.92,
  maxPain: 21500,
  support: [21300, 21000],
  resistance: [21700, 22000],
  signal: "neutral",
  chain: [
    { strike: 21300, callOI: 32_00_000, putOI: 58_00_000 },
    { strike: 21400, callOI: 41_00_000, putOI: 49_00_000 },
    { strike: 21500, callOI: 55_00_000, putOI: 52_00_000, isATM: true },
    { strike: 21600, callOI: 47_00_000, putOI: 38_00_000 },
    { strike: 21700, callOI: 61_00_000, putOI: 29_00_000 },
  ],
};

export const tradePlan: TradePlan = {
  symbol: "RELIANCE",
  segment: "Equity",
  action: "BUY",
  signal: "bullish",
  entry: 2945,
  stopLoss: 2905,
  target1: 2995,
  target2: 3025,
  riskReward: 2.0,
  notes: [
    "Placeholder plan — every live plan must include SL, target & R:R.",
    "Risk per trade kept within 1% of capital (mock).",
  ],
};

export const riskMetrics: RiskMetrics = {
  capital: 100000,
  riskPercent: 1,
  riskAmount: 1000,
  perUnitRisk: 40,
  positionSize: 25,
  riskReward: 2.0,
};

export const sentimentGauges: SentimentGauge[] = [
  { label: "Overall Market", value: 64, signal: "bullish" },
  { label: "India VIX (inv.)", value: 58, signal: "neutral" },
  { label: "Advance / Decline", value: 71, signal: "bullish" },
  { label: "FII Activity", value: 42, signal: "bearish" },
];

export const scannerRows: ScannerRow[] = [
  { symbol: "INFY", segment: "Equity", setup: "Breakout + Vol", ltp: 1542.0, changePercent: 1.49, signal: "bullish" },
  { symbol: "HDFCBANK", segment: "Equity", setup: "Below 50-EMA", ltp: 1678.3, changePercent: -0.56, signal: "bearish" },
  { symbol: "NIFTY 21700 CE", segment: "Index Option", setup: "OI Surge", ltp: 86.4, changePercent: 12.3, signal: "bullish" },
  { symbol: "TATAMOTORS", segment: "Stock Future", setup: "Short Buildup", ltp: 924.5, changePercent: -1.1, signal: "bearish" },
];

// Mock intraday series for the chart placeholder, keyed by timeframe.
export const chartSeries: Record<string, number[]> = {
  "1D": [21380, 21410, 21395, 21440, 21470, 21455, 21490, 21478, 21500, 21512],
  "1W": [21180, 21250, 21310, 21290, 21360, 21420, 21470, 21440, 21500, 21512],
  "1M": [20650, 20810, 20940, 21010, 20980, 21150, 21260, 21330, 21450, 21512],
};
