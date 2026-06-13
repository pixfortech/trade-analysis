// Derived market context for the cockpit: OHLC + event times, an advisory
// entry/exit timing estimate, and bullish/bearish/neutral indicator grouping.
// Pure functions over existing Kite-backed data — no fabrication: when a value
// or time isn't available it returns null (the UI shows "—" / "unavailable").

import { num, numFlex, compact } from "@/lib/format";
import type { ChartDataResponse, LiveSignal } from "@/types/api";
import type { PlanEval, TradePlanSnapshot } from "@/lib/tradePlan";

/* ------------------------------- OHLC strip ------------------------------ */
export interface OhlcPoint {
  label: string;
  value: number | null;
  time: string | null;
  tone: "up" | "down" | "neutral";
  note?: string;
}

function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).toLowerCase();
}

/** Open/High/Low/PrevClose/CMP with event times derived from intraday candles. */
export function deriveOhlc(s: LiveSignal, chart: ChartDataResponse | null): OhlcPoint[] {
  const md = s.marketData;
  const intraday = !!chart && /minute|hour/.test(chart.interval);
  const candles = intraday ? chart!.candles : [];

  let openTime: string | null = candles.length ? candles[0].t : null;
  let highTime: string | null = null;
  let lowTime: string | null = null;
  if (candles.length) {
    let hi = -Infinity;
    let lo = Infinity;
    for (const c of candles) {
      if (c.h > hi) { hi = c.h; highTime = c.t; }
      if (c.l < lo) { lo = c.l; lowTime = c.t; }
    }
  }

  const prev = md.previousClose;
  const tone = (v: number | null): "up" | "down" | "neutral" => (v == null || prev == null ? "neutral" : v >= prev ? "up" : "down");

  // Order: Previous Close → High → Low → Open → CMP.
  return [
    { label: "Prev close", value: prev, time: null, tone: "neutral", note: "prev session" },
    { label: "High", value: md.high, time: fmtTime(highTime), tone: "up" },
    { label: "Low", value: md.low, time: fmtTime(lowTime), tone: "down" },
    { label: "Open", value: md.open, time: fmtTime(openTime), tone: tone(md.open) },
    { label: "CMP", value: s.currentPrice, time: fmtTime(s.timestamp), tone: tone(s.currentPrice) },
  ];
}

/* --------------------------- entry / exit timing ------------------------- */
export type TimingTone = "bull" | "bear" | "warn" | "info" | "neutral";
export interface TimingEstimate {
  entry: string;
  exit: string;
  tone: TimingTone;
  volatility: string;
}

const f = (n: number | null | undefined) => (n == null ? "—" : `₹${num(n)}`);

/**
 * Advisory entry/exit *timing* (not new levels). Locked levels never move here —
 * only the estimated window/status updates as live data evolves. Uses ATR for a
 * candles-to-entry guess and VWAP/invalidation for the exit-risk window; India
 * VIX is used as the volatility read when available, else labelled unavailable.
 */
export function estimateTiming(plan: TradePlanSnapshot, ev: PlanEval, s: LiveSignal | null, vix: number | null): TimingEstimate {
  const atr = s?.indicators.atr ?? plan.snapshot.atr ?? null;
  const vwap = s?.marketData.vwap ?? plan.snapshot.vwap ?? null;
  const cmp = ev.cmp;
  const long = plan.direction === "LONG";
  const atrPct = atr != null && cmp ? (atr / cmp) * 100 : null;
  const volatility = vix != null ? `India VIX ${vix.toFixed(2)}` : atrPct != null ? `ATR ${atrPct.toFixed(2)}% · VIX unavailable` : "VIX unavailable";

  if (plan.direction === "WAIT") return { entry: "No valid entry window yet — waiting for a setup to form.", exit: "—", tone: "neutral", volatility };
  if (ev.state === "INVALIDATED") return { entry: "Plan void — Re-analyse required for a fresh window.", exit: "Setup invalidated — manage/exit per your own risk.", tone: "bear", volatility };

  const dist = ev.distToEntry == null ? null : Math.abs(ev.distToEntry);
  const n = dist != null && atr != null && atr > 0 ? Math.min(5, Math.max(1, Math.ceil(dist / (0.5 * atr)))) : null;
  const within = n == null ? "the next few candles" : n === 1 ? "the next candle" : `the next 1–${n} candles`;

  let entry: string;
  let tone: TimingTone;
  if (ev.approved || ev.state === "ENTER_NOW") {
    entry = "Entry window: now — CMP is in the locked zone and approved.";
    tone = long ? "bull" : "bear";
  } else if (ev.state === "WAIT_BREAKOUT") {
    entry = `Possible entry window: ${within} if the ${long ? "breakout above" : "breakdown below"} ${f(plan.entry)} holds.`;
    tone = "info";
  } else if (ev.state === "WAIT_PULLBACK") {
    entry = `No immediate window — price ran past the zone. Wait for a pullback toward ${f(plan.entry)}.`;
    tone = "warn";
  } else if (ev.state === "WAIT_CONFIRMATION") {
    entry = "No entry window yet — approval gate not met (win/setup below threshold).";
    tone = "warn";
  } else {
    entry = "No valid entry window yet.";
    tone = "neutral";
  }

  const exit = long
    ? `Exit-risk window: if price stays below VWAP ${f(vwap)} for ~2 candles, or breaks invalidation ${f(plan.invalidation)}.`
    : `Exit-risk window: if price reclaims VWAP ${f(vwap)} for ~2 candles, or breaks invalidation ${f(plan.invalidation)}.`;

  return { entry, exit, tone, volatility };
}

/* --------------------------- indicator grouping -------------------------- */
export type IndTone = "bull" | "bear" | "neutral";
export interface IndChip { key: string; value: string; reason: string; tone: IndTone }
export interface IndGroup { tone: IndTone; label: string; items: IndChip[] }

/** Classify each indicator bull/bear/neutral, then order groups by count desc. */
export function groupIndicators(s: LiveSignal): IndGroup[] {
  const i = s.indicators;
  const price = s.currentPrice;
  const vwap = s.marketData.vwap;
  const chips: IndChip[] = [];

  if (vwap != null) chips.push({ key: "VWAP", value: numFlex(vwap), reason: price >= vwap ? "price above" : "price below", tone: price >= vwap ? "bull" : "bear" });
  if (i.ema20 != null && i.ema50 != null) chips.push({ key: "EMA 20/50", value: `${numFlex(i.ema20)} / ${numFlex(i.ema50)}`, reason: i.ema20 >= i.ema50 ? "uptrend" : "downtrend", tone: i.ema20 >= i.ema50 ? "bull" : "bear" });
  if (i.rsi != null) {
    const t: IndTone = i.rsi > 55 ? "bull" : i.rsi < 45 ? "bear" : "neutral";
    chips.push({ key: "RSI", value: numFlex(i.rsi), reason: t === "bull" ? "strength" : t === "bear" ? "weakness" : "neutral 45–55", tone: t });
  }
  if (i.macd != null) {
    const h = i.macd.histogram;
    const t: IndTone = h > 0 ? "bull" : h < 0 ? "bear" : "neutral";
    chips.push({ key: "MACD", value: numFlex(h), reason: t === "bull" ? "positive" : t === "bear" ? "negative" : "flat", tone: t });
  }
  if (i.supertrend != null) chips.push({ key: "Supertrend", value: numFlex(i.supertrend.value), reason: i.supertrend.direction, tone: i.supertrend.direction === "bullish" ? "bull" : "bear" });
  if (i.adx != null) chips.push({ key: "ADX", value: numFlex(i.adx.adx), reason: i.adx.adx > 25 ? "strong trend" : i.adx.adx > 20 ? "trending" : "weak / range", tone: "neutral" });
  if (i.volumeConfirmed != null) chips.push({ key: "Volume", value: i.volumeConfirmed ? "Confirmed" : "Low", reason: i.volumeConfirmed ? "confirms move" : "no confirmation", tone: "neutral" });
  if (i.oi != null) chips.push({ key: "OI", value: compact(i.oi), reason: "open interest", tone: "neutral" });

  const groups: IndGroup[] = [
    { tone: "bull", label: "Bullish", items: chips.filter((c) => c.tone === "bull") },
    { tone: "bear", label: "Bearish", items: chips.filter((c) => c.tone === "bear") },
    { tone: "neutral", label: "Neutral", items: chips.filter((c) => c.tone === "neutral") },
  ];
  // Highest count first; stable for ties (keeps bull > bear > neutral on ties).
  return groups.filter((g) => g.items.length > 0).sort((a, b) => b.items.length - a.items.length);
}
