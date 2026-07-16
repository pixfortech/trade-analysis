// Derived market context for the cockpit: OHLC + event times, an advisory
// entry/exit timing estimate, and bullish/bearish/neutral indicator grouping.
// Pure functions over existing Kite-backed data — no fabrication: when a value
// or time isn't available it returns null (the UI shows "—" / "unavailable").

import { num, numFlex, compact } from "@/lib/format";
import type { ChartDataResponse, LiveSignal, OhlcEvent } from "@/types/api";
import type { PlanEval, TradePlanSnapshot } from "@/lib/tradePlan";
import { fmtMarketTime, fmtCandleWindow } from "@/lib/marketTime";

/* ------------------------------- OHLC strip ------------------------------ */
export interface OhlcPoint {
  label: string;
  value: number | null;
  time: string | null;
  tone: "up" | "down" | "neutral";
  note?: string;
  approx?: boolean; // candle-precision (not an exact tick)
  title?: string;
}

/**
 * Open/High/Low/PrevClose/CMP. Uses the backend sessionOhlc (current-session
 * only, epoch-ms instants) and renders each time in the market timezone ONCE.
 * No sessionOhlc → values only, no fabricated event times.
 */
export function deriveOhlc(s: LiveSignal, chart: ChartDataResponse | null, opts?: { timezone?: string; showMillis?: boolean }): OhlcPoint[] {
  const tz = opts?.timezone ?? "Asia/Kolkata";
  const showMs = opts?.showMillis ?? true;
  const so = chart?.sessionOhlc ?? null;
  const prev = so?.prevClose.value ?? s.marketData.previousClose;
  const tone = (v: number | null): "up" | "down" | "neutral" => (v == null || prev == null ? "neutral" : v >= prev ? "up" : "down");

  if (so) {
    const evT = (ev: OhlcEvent, kind: "hilo" | "open" | "cmp"): Pick<OhlcPoint, "time" | "note" | "approx" | "title"> => {
      if (ev.ms == null) return { time: null, note: ev.precision === "receipt" ? "recv n/a" : undefined };
      if (ev.precision === "candle") return { time: fmtMarketTime(ev.ms, tz, false), approx: true, note: "candle", title: fmtCandleWindow(ev.ms, tz) ?? undefined };
      // tick / exchange precision
      return { time: fmtMarketTime(ev.ms, tz, showMs), note: kind === "cmp" ? "exchange" : undefined, title: kind === "cmp" ? "exchange / last-trade time" : undefined };
    };
    const cmpVal = so.cmp.value ?? s.currentPrice;
    const h = evT(so.high, "hilo");
    const l = evT(so.low, "hilo");
    const o = evT(so.open, "open");
    const cmpMeta = so.cmp.ms != null ? evT(so.cmp, "cmp") : { time: fmtMarketTime(Date.parse(s.timestamp), tz, showMs), note: "recv", title: "backend receipt time" };
    return [
      { label: "Prev close", value: prev, time: null, tone: "neutral", note: "prev session" },
      { label: "High", value: so.high.value, tone: "up", ...h },
      { label: "Low", value: so.low.value, tone: "down", ...l },
      { label: "Open", value: so.open.value, tone: tone(so.open.value), ...o },
      { label: "CMP", value: cmpVal, tone: tone(cmpVal), ...cmpMeta },
    ];
  }

  // Fallback (no sessionOhlc) — values only; CMP shows the labelled receipt time.
  const md = s.marketData;
  return [
    { label: "Prev close", value: md.previousClose, time: null, tone: "neutral", note: "prev session" },
    { label: "High", value: md.high, time: null, tone: "up" },
    { label: "Low", value: md.low, time: null, tone: "down" },
    { label: "Open", value: md.open, time: null, tone: tone(md.open) },
    { label: "CMP", value: s.currentPrice, time: fmtMarketTime(Date.parse(s.timestamp), tz, showMs), tone: tone(s.currentPrice), note: "recv", title: "backend receipt time" },
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
