"use client";

import { useEffect } from "react";
import type { ChartDataResponse, DecisionSnapshot, LiveSignal } from "@/types/api";
import type { AnalysisSession } from "@/hooks/useAnalysisSession";

export interface MonitoringLive {
  active: boolean; // monitoring on (session exists, live on, not paused)
  hasSession: boolean;
  analysedCmp: number | null;
  analysedAt: number | null;
  startedAt: number | null;
  direction: "LONG" | "SHORT" | "WAIT" | null;
  liveCmp: number | null;
  movement: number | null; // liveCmp − analysedCmp
  movementPct: number | null;
  mfe: number | null; // max favourable excursion since analysis (direction-aware, points)
  mae: number | null; // max adverse excursion since analysis (points)
  distToTrigger: number | null; // entry − liveCmp (signed, raw)
  inSafeZone: boolean | null;
  candleState: "live" | "closed" | null; // is the latest candle still forming?
  lastTickMs: number | null; // exchange / last-trade time
  lastCandleMs: number | null; // latest candle timestamp
  lastVixMs: number | null;
  lastNewsMs: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Continuous-monitoring DERIVATION over the durable AnalysisSession.
 *
 * The analysed baseline (CMP + locked levels) and the MFE/MAE accumulators live
 * in AnalysisSessionProvider, so they survive a screen switch (unmount/remount)
 * and a reload. This hook only derives the LIVE metrics — movement, distance,
 * safe-zone, candle freshness, per-stream timestamps — from the live signal /
 * decision / chart WITHOUT recomputing the locked plan, and pushes any new MFE/
 * MAE extreme back into the provider. Global Live OFF or a per-session pause
 * simply stops treating it as active; the baseline is untouched.
 */
export function useMonitoringSession(args: {
  session: AnalysisSession | null; // already matched to the current view by the caller
  signal: LiveSignal | null;
  decision: DecisionSnapshot | null;
  chart: ChartDataResponse | null;
  live: boolean;
  bumpExcursion: (mfe: number, mae: number) => void;
  /** Live CMP from the WebSocket tick (preferred over the polled signal price). */
  liveCmp?: number | null;
  /** Source instant (epoch ms) of the WS tick, when streaming. */
  tickMs?: number | null;
}): MonitoringLive {
  const { session, signal, decision, chart, live, bumpExcursion } = args;
  const plan = session?.plan ?? null;
  // Prefer the streamed tick price when present; fall back to the polled signal.
  const liveCmp = args.liveCmp != null ? args.liveCmp : signal?.currentPrice ?? null;
  const long = plan?.direction === "LONG";

  // Track MFE / MAE across ticks (direction-aware) without moving the plan.
  useEffect(() => {
    if (!session || liveCmp == null || plan?.direction === "WAIT") return;
    const fav = long ? liveCmp - session.analysedCmp : session.analysedCmp - liveCmp;
    bumpExcursion(fav > 0 ? fav : 0, fav < 0 ? -fav : 0);
  }, [liveCmp, session, long, plan?.direction, bumpExcursion]);

  // Derived live metrics.
  let movement: number | null = null;
  let movementPct: number | null = null;
  let distToTrigger: number | null = null;
  let inSafeZone: boolean | null = null;
  let mfe: number | null = null;
  let mae: number | null = null;
  if (session && liveCmp != null) {
    movement = r2(liveCmp - session.analysedCmp);
    movementPct = session.analysedCmp ? r2((movement / session.analysedCmp) * 100) : null;
    if (plan?.entry != null) distToTrigger = r2(plan.entry - liveCmp);
    if (plan?.safeLow != null && plan?.safeHigh != null) inSafeZone = liveCmp >= plan.safeLow && liveCmp <= plan.safeHigh;
    // Include the current tick so the display isn't a render behind the accumulator.
    const fav = long ? liveCmp - session.analysedCmp : session.analysedCmp - liveCmp;
    mfe = r2(Math.max(session.mfe, fav > 0 ? fav : 0));
    mae = r2(Math.max(session.mae, fav < 0 ? -fav : 0));
  } else if (session) {
    mfe = r2(session.mfe);
    mae = r2(session.mae);
  }

  // Per-stream timestamps for the monitoring proof strip. A live WS tick time wins.
  const lastTickMs = args.tickMs != null ? args.tickMs : chart?.sessionOhlc?.cmp.ms ?? (signal && !Number.isNaN(Date.parse(signal.timestamp)) ? Date.parse(signal.timestamp) : null);
  const lastCandleMs = chart && chart.candles.length ? (Number.isNaN(Date.parse(chart.candles[chart.candles.length - 1].t)) ? null : Date.parse(chart.candles[chart.candles.length - 1].t)) : null;
  const lastVixMs = decision?.vix.available && decision.vix.timestamp && !Number.isNaN(Date.parse(decision.vix.timestamp)) ? Date.parse(decision.vix.timestamp) : null;
  const lastNewsMs = decision && !Number.isNaN(Date.parse(decision.timestamp)) ? Date.parse(decision.timestamp) : null;

  // Live vs closed candle: the latest candle is "forming" if now is within its interval.
  let candleState: "live" | "closed" | null = null;
  if (lastCandleMs != null && chart?.sessionOhlc) {
    candleState = Date.now() - lastCandleMs < chart.sessionOhlc.intervalMs ? "live" : "closed";
  }

  const enabled = session?.monitoringEnabled !== false;
  return {
    active: !!session && live && enabled && plan?.direction !== "WAIT",
    hasSession: !!session,
    analysedCmp: session?.analysedCmp ?? null,
    analysedAt: session?.analysedAt ?? null,
    startedAt: session?.startedAt ?? null,
    direction: plan?.direction ?? null,
    liveCmp,
    movement,
    movementPct,
    mfe,
    mae,
    distToTrigger,
    inSafeZone,
    candleState,
    lastTickMs,
    lastCandleMs,
    lastVixMs,
    lastNewsMs,
  };
}
