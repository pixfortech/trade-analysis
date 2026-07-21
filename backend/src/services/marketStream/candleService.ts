// =====================================================================
// Live-candle service — a registry of tick-built candle series, one per
// (instrument token, interval). Fed by the stream hub's ticks, seeded from REST.
//
// This is the bridge between the raw tick flow and the indicator/decision layer:
//   • fetchMarketData seeds a series from getHistorical the first time (warm-up)
//   • the stream hub folds every tick into all of that token's interval series
//   • fetchMarketData then reads the WARM series instead of re-fetching REST (§4/§7)
//   • on a genuine cold gap (no recent tick) it falls back to REST — zero risk
//     when the WebSocket isn't streaming (the series never warms → always REST).
// =====================================================================

import { intelConfig } from "../../config/intelligence.config";
import { intervalToMs } from "../sessionOhlc";
import { LiveCandleSeries, type Candle } from "./liveCandles";

const registry = new Map<string, LiveCandleSeries>(); // `${token}|${interval}` → series

function keyOf(token: number, interval: string): string {
  return `${token}|${interval}`;
}

function getOrCreate(token: number, interval: string): LiveCandleSeries {
  const k = keyOf(token, interval);
  let s = registry.get(k);
  if (!s) {
    s = new LiveCandleSeries(intervalToMs(interval), intelConfig.stream.candleMaxCount);
    registry.set(k, s);
  }
  return s;
}

/** Seed (or re-seed) a series from REST history for indicator warm-up. */
export function seedSeries(token: number, interval: string, candles: Candle[]): void {
  getOrCreate(token, interval).seed(candles);
}

/** Fold one tick into EVERY interval series maintained for this token. */
export function onTick(token: number, price: number, tickMs: number, cumVolume: number | null): void {
  const prefix = `${token}|`;
  for (const [k, s] of registry) {
    if (k.startsWith(prefix)) s.onTick(tickMs, price, cumVolume);
  }
}

/**
 * The WARM tick-built candles for (token, interval), or null when the series is
 * cold (no recent tick) or disabled — in which case the caller uses REST. Only
 * returns a series with enough candles for the indicator warm-up.
 */
export function getLiveCandles(token: number, interval: string, now: number = Date.now()): Candle[] | null {
  if (!intelConfig.stream.candlesFromTicks) return null;
  const s = registry.get(keyOf(token, interval));
  if (!s || !s.isWarm(intelConfig.stream.candleWarmMs, now)) return null;
  const cs = s.candles();
  return cs.length >= intelConfig.loop.dataQuality.minCandles ? cs : null;
}

export function isWarm(token: number, interval: string, now: number = Date.now()): boolean {
  const s = registry.get(keyOf(token, interval));
  return !!s && s.isWarm(intelConfig.stream.candleWarmMs, now);
}

/**
 * Reconnect handling (§19): drop every series so the next fetchMarketData re-seeds
 * from REST (filling any candle gap that opened during the disconnect), after
 * which tick-built candles resume. Called by the hub on ticker (re)connect.
 */
export function onReconnect(): void {
  registry.clear();
}

/** Test/reset hook. */
export function _reset(): void {
  registry.clear();
}
