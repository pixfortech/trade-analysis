// =====================================================================
// MOCK DATA BUILDERS — Phase 2 (placeholder responses only)
// ---------------------------------------------------------------------
// Deterministic sample payloads so the API is fully runnable without any
// live market data or AI provider. Quote/history are simple fixtures;
// analysis/trade-plan match the shared contracts and act as the backend's
// fallback when the AI engine is unavailable. Replace with real provider /
// AI-engine output in later phases.
// =====================================================================

import type { Action, AnalysisResponse, Signal, TradePlanResponse } from "../types/contracts";

export const DISCLAIMER =
  "Educational use only. Not investment advice. Trading involves risk of loss. Live data depends on authorised API providers. Data is mock/demo until authorised live market data is integrated.";

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

// --- Deterministic helpers (stable output per symbol) ---
function seedFrom(symbol: string): number {
  let h = 0;
  for (const ch of symbol.toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h;
}

function basePrice(symbol: string): number {
  return round(500 + (seedFrom(symbol) % 3500) + 0.5);
}

function signalFrom(symbol: string): Signal {
  return (["bullish", "bearish", "neutral"] as const)[seedFrom(symbol) % 3];
}

/** Contract-shaped mock analysis (backend fallback for technical/futures/options). */
export function mockAnalysis(symbol: string, segment: string): AnalysisResponse {
  const sym = symbol.toUpperCase();
  const seed = seedFrom(sym);
  const signal = signalFrom(sym);
  return {
    source: "mock",
    demo: true,
    symbol: sym,
    segment,
    signal,
    score: round((seed % 100) / 100),
    notes: ["DEMO analysis from deterministic mock data — not live market analysis."],
    metrics: { rsi: round(40 + (seed % 30)), trend: signal },
    disclaimer: DISCLAIMER,
  };
}

/** Contract-shaped mock trade plan (backend fallback). Always includes risk controls. */
export function mockTradePlan(input: { symbol: string; segment?: string }): TradePlanResponse {
  const symbol = input.symbol.toUpperCase();
  const segment = input.segment ?? "equity";
  const signal = signalFrom(symbol);
  const base = basePrice(symbol);
  const action: Action = signal === "bullish" ? "BUY" : signal === "bearish" ? "SELL" : "HOLD";
  const longSide = action !== "SELL";
  const entry = base;
  const stopLoss = round(longSide ? base * 0.985 : base * 1.015);
  const target = round(longSide ? base * 1.03 : base * 0.97);
  const riskReward = round(Math.abs(target - entry) / Math.abs(entry - stopLoss));
  const confidence = 55 + (seedFrom(symbol) % 25);
  return {
    source: "mock",
    demo: true,
    symbol,
    segment,
    action,
    signal,
    confidence,
    entry,
    stopLoss,
    target,
    riskReward,
    rationale: [
      "DEMO trade plan from deterministic mock data — no live market data is used.",
      `Derived a ${signal} bias for ${symbol}; position size must respect the stop-loss.`,
    ],
    disclaimer: DISCLAIMER,
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
