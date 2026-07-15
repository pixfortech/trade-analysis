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

// Phase 3G additions
export interface MarketStatusResponse {
  market: "NSE";
  timezone: "Asia/Kolkata";
  status: "open" | "closed" | "pre-open" | "post-close" | "weekend" | "holiday-unknown";
  currentIstTime: string;
  nextOpenTime: string | null;
  nextCloseTime: string | null;
  holidayStatus: "unknown";
  message: string;
}

export interface AccountSummaryResponse {
  readOnly: true;
  source: "zerodha" | "unavailable" | "user-override";
  availableCapital: number;
  availableCash: number;
  marginAvailable: number;
  marginUsed: number;
  holdingsValue: number;
  positionsPnl: number;
  message: string;
}

export type PaperDirection = "LONG" | "SHORT";
export type PaperStatus = "OPEN" | "CLOSED" | "PARTIAL";
export interface PaperTradeView {
  id: string;
  instrumentKey: string;
  displayName: string;
  direction: PaperDirection;
  entryPrice: number;
  currentPrice: number | null;
  quantity: number;
  initialQuantity: number;
  lotSize: number;
  lots: number;
  stopLoss: number | null;
  targets: number[];
  status: PaperStatus;
  unrealisedPnl: number;
  realisedPnl: number;
  pnlPercent: number;
  entryTime: string;
  exitTime: string | null;
  exitPrice: number | null;
  notes: string;
  source: "paper-simulation";
}
export interface PaperSummary {
  count: number;
  openCount: number;
  totalUnrealisedPnl: number;
  totalRealisedPnl: number;
  totalPnl: number;
}

export interface Mover {
  instrument: string;
  displayName: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
}
export interface TopMoversResponse {
  segment: "equity" | "indices" | "futures" | "options";
  source: "kite";
  partialData: boolean;
  gainers: Mover[];
  losers: Mover[];
  timestamp: string;
  scanned: number;
  total: number;
  message: string;
}

// Market intelligence — combined technical + VIX + news + breadth (READ-ONLY).
export type NewsRelevanceType = "DIRECT_INSTRUMENT" | "UNDERLYING" | "SECTOR" | "BENCHMARK" | "MARKET_WIDE" | "MACRO" | "IRRELEVANT";
export interface NewsItem {
  id?: string;
  title: string;
  source: string;
  url: string | null;
  publishedAt: string | null;
  ageMinutes: number | null;
  sentiment: "positive" | "negative" | "neutral";
  impact: "low" | "medium" | "high";
  reason: string;
  matched?: string;
  relevanceType?: NewsRelevanceType;
  relevanceScore?: number;
  relevanceReason?: string;
}
export interface NewsResponse { available: boolean; items: NewsItem[]; sources: string[]; fetchedAt: string; message?: string }
export interface VixInfo {
  available: boolean;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  status: "low" | "normal" | "elevated" | "high" | "unknown";
  direction: "rising" | "falling" | "flat" | "unknown";
  interpretation: string;
  score: number;
  timestamp: string;
  message?: string;
}
export interface IntelFactorCard { key: string; label: string; status: string; value: string; tone: "bull" | "bear" | "neutral" | "warn"; reason: string }
export interface SentimentAgg { label: "positive" | "negative" | "neutral"; stockScore: number; marketScore: number; strongNegative: boolean; strongPositive: boolean; reasons: string[] }
export interface MarketIntelligenceResponse {
  instrument: string;
  displayName: string;
  timestamp: string;
  finalAction: "ENTER" | "WAIT" | "HOLD" | "EXIT" | "AVOID" | "NO ACTION";
  bias: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  winEstimate: number;
  risk: "Low" | "Medium" | "High";
  caution: string;
  reason: string;
  supporting: string[];
  blocking: string[];
  entryWindow: string;
  exitWindow: string;
  cards: IntelFactorCard[];
  study: { technical: string; vix: string; news: string; trend: string; risk: string; recommendation: string };
  vix: VixInfo;
  news: NewsResponse;
  newsMatched: NewsItem[];
  sentiment: SentimentAgg;
  trend: { breadthAdv: number; breadthDec: number; breadthScore: number; note: string };
  technical: { action: string; trend: string; strength: string; bullishPercent: number; invalidation: number; dataQuality: string };
  readOnly: true;
  disclaimer: string;
  notice?: string;
}

// Phase 3F additions
export type IndicatorId = "VWAP" | "EMA20" | "EMA50" | "RSI" | "MACD" | "ADX" | "ATR" | "SUPERTREND" | "VOLUME" | "OI";

export interface IndicatorContribution {
  id: IndicatorId;
  direction: "bullish" | "bearish" | "neutral" | "unavailable";
  weight: number;
  value: string;
  detail: string;
}

export interface ChartPoint {
  t: string;
  v: number;
}
export interface ChartDataResponse {
  source: "kite";
  live: true;
  readOnly: true;
  instrument: string;
  interval: string;
  candles: { t: string; o: number; h: number; l: number; c: number; v: number }[];
  activeIndicators: IndicatorId[];
  overlays: Record<string, ChartPoint[]>;
  oscillators: Record<string, ChartPoint[]>;
  levels: {
    pivot: number | null;
    bc: number | null;
    tc: number | null;
    r1: number | null;
    s1: number | null;
    prevHigh: number | null;
    prevLow: number | null;
    prevClose: number | null;
  };
  lastUpdated: string;
}

export type MonitorAction = "HOLD" | "TIGHTEN_SL" | "EXIT_NOW" | "PARTIAL_EXIT" | "REVERSE_SETUP" | "WAIT_FOR_REENTRY";
export interface ActiveTradeMonitor {
  instrument: string;
  positionDirection: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  currentPnL: number;
  currentPnLPerUnit: number;
  trendChangeDetected: boolean;
  previousTrend: string;
  currentTrend: "bullish" | "bearish" | "sideways";
  recommendedAction: MonitorAction;
  bestExitForLeastLoss: number;
  updatedStopLoss: number;
  newEntryPlan: {
    direction: "LONG" | "SHORT" | "none";
    entryLevel: number | null;
    stopLoss: number | null;
    target1: number | null;
    target2: number | null;
    note: string;
  };
  alertSeverity: "info" | "caution" | "urgent";
  reason: string;
  readOnly: true;
  disclaimer: string;
}

// Live Market Signal (Phase 3E/3F).
export type SignalAction = "LONG" | "SHORT" | "WAIT" | "AVOID";
export type SetupStatus = "active" | "wait" | "avoid";

export interface SignalSetup {
  status: SetupStatus;
  entryAbove?: number;
  entryBelow?: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  partialExit: number;
  fullExit: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  riskReward: string;
  quantity: number;
  estimatedProfitForOneLot: number;
  estimatedLossForOneLot: number;
  condition: string;
}

export interface LiveSignal {
  instrument: string;
  resolvedInstrument: {
    instrumentKey: string;
    instrumentToken: number;
    exchange: string;
    tradingsymbol: string;
    displayName: string;
    segment: string;
    instrumentType: string;
    lotSize: number;
    expiry: string;
    strike: number;
    optionType: string;
  };
  source: "kite";
  live: true;
  readOnly: true;
  timestamp: string;
  currentPrice: number;
  marketData: { open: number; high: number; low: number; previousClose: number; volume: number; vwap: number | null };
  indicators: {
    ema9: number | null;
    ema20: number | null;
    ema50: number | null;
    rsi: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    atr: number | null;
    adx: { adx: number; plusDI: number; minusDI: number } | null;
    supertrend: { value: number; direction: "bullish" | "bearish" } | null;
    volumeConfirmed: boolean | null;
    oi: number | null;
  };
  activeIndicators: IndicatorId[];
  indicatorContributions: IndicatorContribution[];
  missingIndicators: IndicatorId[];
  trend: { direction: "bullish" | "bearish" | "sideways"; strength: "weak" | "moderate" | "strong"; score: number; reason: string };
  probability: {
    bullishPercent: number;
    bearishPercent: number;
    estimatedWinPercent: number;
    confidence: "low" | "medium" | "high";
    dataQuality: "quote-only" | "candle-backed" | "strong";
  };
  levels: { support1: number; support2: number; resistance1: number; resistance2: number; noTradeZone: string };
  longSetup: SignalSetup;
  shortSetup: SignalSetup;
  preferredSetup: "long" | "short" | "none";
  finalDecision: { action: SignalAction; reason: string; preferredSetup: "long" | "short" | "none"; invalidationLevel: number };
  disclaimer: string;
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
  tickSize: number;
  /** False for reference-only instruments Kite can't quote (e.g. NSEIX/GIFT). */
  quotable: boolean;
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

// ---- Real-time decision loop (READ-ONLY) — GET /api/analysis/decision ----
export type LoopAction = "ENTER" | "WAIT" | "HOLD" | "EXIT" | "AVOID" | "NO ACTION";
export type LoopState =
  | "IDLE" | "WATCHING" | "SETUP_DETECTED" | "WAITING_FOR_TRIGGER" | "ENTRY_APPROVED"
  | "IN_TRADE" | "HOLDING" | "TRAILING" | "EXIT_WARNING" | "EXIT_APPROVED" | "INVALIDATED" | "COOLDOWN";
export type InputState = "AVAILABLE_FRESH" | "AVAILABLE_STALE" | "UNAVAILABLE" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA";

export interface DecisionTransition {
  at: string; fromState: LoopState; toState: LoopState; fromAction: LoopAction; toAction: LoopAction;
  cmp: number; trigger: number | null; confidence: number; winEstimate: number; vix: number | null;
  newsScore: number; marketTrend: string; reason: string; supporting: string[]; blocking: string[];
}
export interface DecisionSetup {
  type: string; direction: "LONG" | "SHORT"; label: string; trigger: number | null;
  safeZone: { lo: number; hi: number } | null; stop: number; targets: number[]; rr: number | null;
  confidence: number; reasons: string[]; blockers: string[]; secondary: boolean; triggered: boolean; inSafeZone: boolean;
}
export interface DecisionSnapshot {
  instrument: string; displayName: string; interval: string; riskProfile: string; timestamp: string; cmp: number;
  action: LoopAction; proposedAction: LoopAction; state: LoopState; stateSinceMs: number; transitioned: boolean;
  pending: { action: LoopAction; count: number; required: number } | null;
  reason: string; regime: string; regimeReasons: string[];
  bias: "Bullish" | "Bearish" | "Neutral"; risk: "Low" | "Medium" | "High"; confidence: number;
  approval: { current: "APPROVED" | "NOT APPROVED" | "N/A"; winEstimate: number; setupStrength: number; minWin: number; minConfidence: number };
  dataQuality: { overall: "OK" | "DEGRADED" | "STALE"; inputs: { name: string; state: InputState; note?: string }[] };
  plan: { direction: "LONG" | "SHORT"; trigger: number | null; safeZone: { lo: number; hi: number } | null; entry: number; stopLoss: number; targets: number[]; invalidation: number; rr: number | null; source: "position" | "candidate"; triggered: boolean; inSafeZone: boolean } | null;
  freshSetup: { direction: "LONG" | "SHORT"; label: string; trigger: number | null; stop: number; targets: number[]; confidence: number; whyDiffers: string } | null;
  scores: { technical: number; priceAction: number; trend: number; momentum: number; volumeOi: number; vix: number; news: number; market: number; risk: number };
  supporting: string[]; blocking: string[]; conflicts: string[];
  chandelier: { longStop: number; shortStop: number; direction: 1 | -1 } | null;
  exit: { status: string; trailStop: number | null; reasons: string[] } | null;
  timing: { entryWindow: string; exitWindow: string; nextConfirmation: string };
  setups: DecisionSetup[];
  vix: VixInfo;
  newsSummary: { available: boolean; matched: number; total: number; label: string; message?: string };
  newsDecisionImpact: { directRelevantCount: number; marketContextCount: number; ignoredCount: number; score: number; label: string; supportingHeadlineIds: string[]; blockingHeadlineIds: string[] };
  relevantNews: NewsItem[];
  marketContext: NewsItem[];
  trend: { breadthAdv: number; breadthDec: number; breadthScore: number; note: string };
  history: DecisionTransition[];
  readOnly: true; disclaimer: string;
}
