// =====================================================================
// MOCK DATA BUILDERS — Phase 1 (placeholder responses only)
// ---------------------------------------------------------------------
// These functions fabricate deterministic sample payloads so the API is
// fully runnable without any live market data or AI provider. Replace
// with real provider/AI-engine calls in later phases.
// =====================================================================

export const DISCLAIMER =
  "Educational use only. Not investment advice. Trading involves risk of loss. Live data depends on authorised API providers.";

export function buildQuote(symbol: string, segment = "equity") {
  return {
    symbol: symbol.toUpperCase(),
    segment,
    ltp: 2945.5,
    change: 18.2,
    changePercent: 0.62,
    open: 2930.0,
    high: 2958.0,
    low: 2921.4,
    prevClose: 2927.3,
    volume: 5_123_000,
    timestamp: new Date().toISOString(),
  };
}

export function buildHistory(symbol: string, interval = "1d", limit = 50) {
  const candles = [];
  let base = 2900;
  const start = Date.now() - limit * 86_400_000;
  for (let i = 0; i < limit; i++) {
    const drift = Math.sin(i / 4) * 25 + i * 0.8;
    const o = base + drift;
    const c = o + Math.cos(i / 3) * 12;
    const h = Math.max(o, c) + 8;
    const l = Math.min(o, c) - 8;
    candles.push({
      t: new Date(start + i * 86_400_000).toISOString(),
      o: round(o),
      h: round(h),
      l: round(l),
      c: round(c),
      v: 4_000_000 + i * 12_000,
    });
    base = c;
  }
  return { symbol: symbol.toUpperCase(), interval, count: candles.length, candles };
}

export function buildTechnical(symbol: string) {
  return {
    symbol: symbol.toUpperCase(),
    signal: "bullish",
    indicators: { rsi: 58.3, macd: "bullish_crossover", ema20: 2941.2, ema50: 2908.7 },
    summary: "Placeholder technical read — wire the real indicator engine (AI engine) later.",
  };
}

export function buildFutures(symbol: string, expiry?: string) {
  return {
    symbol: symbol.toUpperCase(),
    expiry: expiry ?? "2026-01-29",
    signal: "bullish",
    futures: { basis: 35.7, oiChangePercent: 5.1, interpretation: "long_buildup" },
  };
}

export function buildOptions(symbol: string, expiry?: string) {
  return {
    symbol: symbol.toUpperCase(),
    expiry: expiry ?? "2026-01-29",
    spot: 21512,
    pcr: 0.92,
    maxPain: 21500,
    support: [21300, 21000],
    resistance: [21700, 22000],
    signal: "neutral",
  };
}

export function buildTradePlan(input: {
  symbol: string;
  segment?: string;
  capital?: number;
  riskPercent?: number;
}) {
  const entry = 2945;
  const stopLoss = 2905;
  const target = 3025;
  const riskPerUnit = entry - stopLoss;
  const rewardPerUnit = target - entry;
  return {
    symbol: input.symbol.toUpperCase(),
    segment: input.segment ?? "equity",
    action: "BUY",
    signal: "bullish",
    confidence: 0, // placeholder — real scoring added later
    entry,
    stopLoss,
    target,
    riskReward: round(rewardPerUnit / riskPerUnit),
    rationale: ["Placeholder rationale — connect the AI engine in a later phase."],
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
