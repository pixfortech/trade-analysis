// India VIX (volatility) — READ-ONLY. Symbols, thresholds, scores, direction
// sensitivity and cache TTL all come from intelConfig.vix (env-overridable).
// If not quotable/authorised it returns { available:false } — never fabricated.

import * as kite from "./kite.service";
import { intelConfig } from "../config/intelligence.config";

export interface VixResult {
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

let cache: { at: number; result: VixResult } | null = null;

function interpret(value: number, change: number): { status: VixResult["status"]; direction: VixResult["direction"]; interpretation: string; score: number } {
  const { thresholds, directionSensitivityPct, scoreByStatus, directionAdj } = intelConfig.vix;
  const status: VixResult["status"] = value < thresholds.low ? "low" : value < thresholds.normal ? "normal" : value < thresholds.elevated ? "elevated" : "high";
  const pct = value > 0 ? (change / value) * 100 : 0;
  const direction: VixResult["direction"] = pct > directionSensitivityPct ? "rising" : pct < -directionSensitivityPct ? "falling" : "flat";

  let score = scoreByStatus[status];
  if (direction === "rising") score += directionAdj.rising;
  else if (direction === "falling") score += directionAdj.falling;
  score = Math.max(-1, Math.min(1, Math.round(score * 100) / 100));

  const levelText =
    status === "low" ? "Low VIX — market calm/stable"
      : status === "normal" ? "Normal VIX"
        : status === "elevated" ? "Elevated VIX — trade with caution"
          : "High VIX — volatile, size down / avoid fresh chase";
  const dirText = direction === "rising" ? " · rising (caution)" : direction === "falling" ? " · falling (risk improving)" : "";
  return { status, direction, interpretation: `${levelText}${dirText}`, score };
}

export async function getVix(): Promise<VixResult> {
  if (cache && Date.now() - cache.at < intelConfig.vix.cacheMs) return cache.result;

  const unavailable = (message: string): VixResult => ({
    available: false, value: null, change: null, changePercent: null, status: "unknown", direction: "unknown",
    interpretation: "VIX unavailable — decision uses technicals + news only.", score: 0, timestamp: new Date().toISOString(), message,
  });

  if (!kite.isLiveDataEnabled() || !kite.isConfigured() || !kite.hasAccessToken()) {
    return unavailable("Kite not authorised.");
  }

  for (const key of intelConfig.vix.symbols) {
    try {
      const q = await kite.getQuoteData(key);
      if (q.lastPrice > 0) {
        const value = q.lastPrice;
        const prev = q.ohlc.close;
        const change = prev > 0 ? Math.round((value - prev) * 100) / 100 : 0;
        const changePercent = prev > 0 ? Math.round(((value - prev) / prev) * 10000) / 100 : 0;
        const { status, direction, interpretation, score } = interpret(value, change);
        const result: VixResult = { available: true, value, change, changePercent, status, direction, interpretation, score, timestamp: new Date().toISOString() };
        cache = { at: Date.now(), result };
        return result;
      }
    } catch {
      /* try next configured symbol */
    }
  }
  const result = unavailable("India VIX not quotable via Kite for this session.");
  cache = { at: Date.now(), result };
  return result;
}
