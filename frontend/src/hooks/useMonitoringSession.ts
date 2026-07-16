"use client";

import { useEffect, useState } from "react";
import type { ChartDataResponse, DecisionSnapshot, LiveSignal } from "@/types/api";
import type { TradePlanSnapshot } from "@/lib/tradePlan";

export interface MonitoringSession {
  id: string;
  instrument: string;
  interval: string;
  riskProfile: string;
  direction: "LONG" | "SHORT" | "WAIT";
  startedAt: number; // monitoring start (epoch ms)
  analysedCmp: number; // baseline CMP at analysis
  analysedAt: number | null; // analysis quote/calc time (epoch ms)
  entry: number | null;
  stop: number | null;
  targets: number[];
  safeLow: number | null;
  safeHigh: number | null;
  invalidation: number | null;
  winEstimate: number;
  setupStrength: number;
  regime: string;
}

export interface MonitoringLive {
  active: boolean;
  session: MonitoringSession | null;
  liveCmp: number | null;
  movement: number | null; // liveCmp − analysedCmp
  movementPct: number | null;
  mfe: number | null; // max favourable excursion since analysis (direction-aware, ₹)
  mae: number | null; // max adverse excursion since analysis (₹)
  distToTrigger: number | null; // entry − liveCmp (signed)
  inSafeZone: boolean | null;
  candleState: "live" | "closed" | null; // is the latest candle still forming?
  lastTickMs: number | null; // exchange / last-trade time
  lastCandleMs: number | null; // latest candle timestamp
  lastVixMs: number | null;
  lastNewsMs: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Continuous monitoring session created on Analyse. It captures the analysed
 * baseline (CMP + locked levels + initial snapshot) ONCE and then tracks live
 * movement / MFE / MAE / distance-to-trigger and the last-updated timestamps
 * for each stream — WITHOUT recomputing the locked plan. It survives rerenders,
 * and resets when the instrument, timeframe or strategy mode changes (or the
 * plan is cleared). Global Live OFF simply stops the upstream ticks.
 */
export function useMonitoringSession(args: {
  plan: TradePlanSnapshot | null;
  signal: LiveSignal | null;
  decision: DecisionSnapshot | null;
  chart: ChartDataResponse | null;
  instrument: string | null;
  interval: string;
  riskProfile: string;
  live: boolean;
}): MonitoringLive {
  const { plan, signal, decision, chart, instrument, interval, riskProfile, live } = args;
  const [session, setSession] = useState<MonitoringSession | null>(null);
  const [exc, setExc] = useState<{ mfe: number; mae: number }>({ mfe: 0, mae: 0 });

  const key = instrument ? `${instrument}|${interval}|${riskProfile}` : null;
  const planId = plan ? `${key}|${plan.generatedAt}` : null;

  // Create / replace the session when a NEW plan is locked; clear otherwise.
  useEffect(() => {
    if (!key || !plan || !signal || plan.direction === "WAIT") {
      setSession(null);
      setExc({ mfe: 0, mae: 0 });
      return;
    }
    setSession((prev) => {
      if (prev && prev.id === planId) return prev; // same locked plan — keep baseline
      setExc({ mfe: 0, mae: 0 });
      return {
        id: planId!,
        instrument: instrument!,
        interval,
        riskProfile,
        direction: plan.direction,
        startedAt: Date.now(),
        analysedCmp: signal.currentPrice,
        analysedAt: chart?.sessionOhlc?.cmp.ms ?? (Number.isNaN(Date.parse(signal.timestamp)) ? null : Date.parse(signal.timestamp)),
        entry: plan.entry,
        stop: plan.stopLoss,
        targets: plan.targets.filter((t): t is number => t != null),
        safeLow: plan.safeLow,
        safeHigh: plan.safeHigh,
        invalidation: plan.invalidation,
        winEstimate: plan.winEstimate,
        setupStrength: plan.setupStrength,
        regime: decision?.regime ?? "UNCERTAIN",
      };
    });
    // Baseline captured once per locked plan; live values flow in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, planId]);

  const liveCmp = signal?.currentPrice ?? null;

  // Track MFE / MAE across ticks (direction-aware) without moving the plan.
  useEffect(() => {
    if (!session || liveCmp == null) return;
    const long = session.direction === "LONG";
    const fav = long ? liveCmp - session.analysedCmp : session.analysedCmp - liveCmp;
    setExc((prev) => {
      const mfe = Math.max(prev.mfe, fav);
      const mae = Math.max(prev.mae, -fav);
      return mfe === prev.mfe && mae === prev.mae ? prev : { mfe, mae };
    });
  }, [liveCmp, session]);

  // Derived live metrics.
  let movement: number | null = null;
  let movementPct: number | null = null;
  let distToTrigger: number | null = null;
  let inSafeZone: boolean | null = null;
  if (session && liveCmp != null) {
    movement = r2(liveCmp - session.analysedCmp);
    movementPct = session.analysedCmp ? r2((movement / session.analysedCmp) * 100) : null;
    if (session.entry != null) distToTrigger = r2(session.entry - liveCmp);
    if (session.safeLow != null && session.safeHigh != null) inSafeZone = liveCmp >= session.safeLow && liveCmp <= session.safeHigh;
  }

  // Timestamps for the compact monitoring status.
  const lastTickMs = chart?.sessionOhlc?.cmp.ms ?? (signal && !Number.isNaN(Date.parse(signal.timestamp)) ? Date.parse(signal.timestamp) : null);
  const lastCandleMs = chart && chart.candles.length ? (Number.isNaN(Date.parse(chart.candles[chart.candles.length - 1].t)) ? null : Date.parse(chart.candles[chart.candles.length - 1].t)) : null;
  const lastVixMs = decision?.vix.available && decision.vix.timestamp && !Number.isNaN(Date.parse(decision.vix.timestamp)) ? Date.parse(decision.vix.timestamp) : null;
  const lastNewsMs = decision && !Number.isNaN(Date.parse(decision.timestamp)) ? Date.parse(decision.timestamp) : null;

  // Live vs closed candle: the latest candle is "forming" if now is within its interval.
  let candleState: "live" | "closed" | null = null;
  if (lastCandleMs != null && chart?.sessionOhlc) {
    candleState = Date.now() - lastCandleMs < chart.sessionOhlc.intervalMs ? "live" : "closed";
  }

  return {
    active: !!session && live,
    session,
    liveCmp,
    movement,
    movementPct,
    mfe: session ? r2(exc.mfe) : null,
    mae: session ? r2(exc.mae) : null,
    distToTrigger,
    inSafeZone,
    candleState,
    lastTickMs,
    lastCandleMs,
    lastVixMs,
    lastNewsMs,
  };
}
