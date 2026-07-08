// India VIX (volatility) — READ-ONLY. Resolves via the Kite quote endpoint and
// interprets level + direction. Cached briefly. If not quotable/authorised it
// returns { available:false } — never fabricated.

import * as kite from "./kite.service";

export interface VixResult {
  available: boolean;
  value: number | null;
  change: number | null; // vs previous close
  changePercent: number | null;
  status: "low" | "normal" | "elevated" | "high" | "unknown";
  direction: "rising" | "falling" | "flat" | "unknown";
  interpretation: string;
  /** −1 (volatile, reduce risk) … +1 (calm, supports trend trades). */
  score: number;
  timestamp: string;
  message?: string;
}

// India VIX quotable keys to try in order.
const VIX_KEYS = ["NSE:INDIA VIX", "NSE:INDIAVIX"];

let cache: { at: number; result: VixResult } | null = null;
const TTL_MS = 30_000;

function interpret(value: number, change: number): { status: VixResult["status"]; direction: VixResult["direction"]; interpretation: string; score: number } {
  const status: VixResult["status"] = value < 13 ? "low" : value < 17 ? "normal" : value < 22 ? "elevated" : "high";
  const pct = value > 0 ? (change / value) * 100 : 0;
  const direction: VixResult["direction"] = pct > 1.5 ? "rising" : pct < -1.5 ? "falling" : "flat";

  let score = status === "low" ? 0.5 : status === "normal" ? 0.2 : status === "elevated" ? -0.2 : -0.6;
  if (direction === "rising") score -= 0.3;
  else if (direction === "falling") score += 0.3;
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
  if (cache && Date.now() - cache.at < TTL_MS) return cache.result;

  const unavailable = (message: string): VixResult => ({
    available: false, value: null, change: null, changePercent: null, status: "unknown", direction: "unknown",
    interpretation: "VIX unavailable — decision uses technicals + news only.", score: 0, timestamp: new Date().toISOString(), message,
  });

  if (!kite.isLiveDataEnabled() || !kite.isConfigured() || !kite.hasAccessToken()) {
    return unavailable("Kite not authorised.");
  }

  for (const key of VIX_KEYS) {
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
      /* try next key */
    }
  }
  const result = unavailable("India VIX not quotable via Kite for this session.");
  cache = { at: Date.now(), result };
  return result;
}
