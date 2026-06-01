"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import type { LiveAction, LivePlanSide, LiveTradePlan } from "@/types/api";
import { InstrumentSelector, type ResolvedSelection } from "./InstrumentSelector";

const INTERVALS = ["minute", "5minute", "15minute", "30minute", "60minute", "day"];
const RISK_PROFILES = ["conservative", "balanced", "aggressive"];

/**
 * Live Trade Plan — READ-ONLY Kite-based analysis (Phase 3B/3C).
 * Uses the instrument selector (Equity/Futures/Options) to resolve an exact
 * Kite symbol, then shows trend, S/R and long/short level plans with a final
 * decision. There are intentionally NO buy/sell or order-placement controls.
 */
export function LiveTradePlanCard() {
  const [selection, setSelection] = useState<ResolvedSelection | null>({
    instrument: "NSE:RELIANCE",
    instrumentToken: null,
    lotSize: null,
    label: "NSE:RELIANCE",
  });
  const [interval, setInterval] = useState("5minute");
  const [riskProfile, setRiskProfile] = useState("balanced");
  const plan = useAsync(api.liveTradePlan);

  const run = () => {
    if (!selection) return;
    void plan.run({ instrument: selection.instrument, interval, riskProfile });
  };

  return (
    <Card
      id="live-trade-plan"
      title="Live Trade Plan (Kite)"
      subtitle="LIVE · READ-ONLY market analysis"
      action={
        <span className="rounded-full border border-bull/30 bg-bull-soft px-2.5 py-1 text-[11px] font-medium text-bull">
          LIVE KITE · READ-ONLY
        </span>
      }
    >
      {/* Instrument selector (Equity / Futures / Options → exact Kite symbol) */}
      <InstrumentSelector onResolved={setSelection} />

      {/* Resolved-instrument details + run controls */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1 rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
          <p className="text-[11px] text-slate-500">Resolved instrument</p>
          {selection ? (
            <p className="num text-sm font-medium text-slate-100">
              {selection.instrument}
              <span className="text-slate-500">
                {selection.instrumentToken != null ? ` · token ${selection.instrumentToken}` : ""}
                {selection.lotSize != null ? ` · lot ${selection.lotSize}` : ""}
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">None selected</p>
          )}
        </div>
        <select
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          aria-label="Interval"
          className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        >
          {INTERVALS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select
          value={riskProfile}
          onChange={(e) => setRiskProfile(e.target.value)}
          aria-label="Risk profile"
          className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        >
          {RISK_PROFILES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={plan.isLoading || !selection}
          className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {plan.isLoading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      <div className="mt-4">
        {plan.isIdle && (
          <EmptyState
            title="No analysis yet"
            message="Pick an instrument (Equity / Futures / Options), then click Analyze. Requires live Kite data enabled and authorised on the backend."
          />
        )}
        {plan.isLoading && <p className="text-sm text-slate-500">Fetching live data and computing levels…</p>}
        {plan.isError && (
          <ErrorState
            message={plan.error ?? "Analysis failed."}
            hint="Enable & authorise Kite (Live Data card), or check the backend is running. This feature needs live Kite data."
            onRetry={run}
          />
        )}
        {plan.isSuccess && plan.data && <PlanView plan={plan.data} />}
      </div>
    </Card>
  );
}

const ACTION_CLS: Record<LiveAction, string> = {
  LONG: "border-bull/30 bg-bull-soft text-bull",
  SHORT: "border-bear/30 bg-bear-soft text-bear",
  WAIT: "border-neutralSignal/30 bg-neutralSignal-soft text-neutralSignal",
  "RANGE-BOUND": "border-neutralSignal/30 bg-neutralSignal-soft text-neutralSignal",
  AVOID: "border-bear/30 bg-bear-soft text-bear",
};

function PlanView({ plan }: { plan: LiveTradePlan }) {
  return (
    <div className="space-y-4">
      {/* Header: price + decision */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-slate-100">{plan.instrument}</p>
          <p className="num text-sm text-slate-400">
            {num(plan.currentPrice)} <span className="text-slate-600">· prev {num(plan.previousClose)}</span>
          </p>
        </div>
        <div className="text-right">
          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${ACTION_CLS[plan.finalDecision.action]}`}>
            {plan.finalDecision.action}
          </span>
          <p className="mt-1 text-[11px] text-slate-500">confidence: {plan.finalDecision.confidence}</p>
        </div>
      </div>

      {/* Data-quality note */}
      <p
        className={`rounded-md border px-3 py-2 text-[11px] ${
          plan.dataQuality === "live-historical"
            ? "border-white/5 bg-base-800/40 text-slate-400"
            : "border-neutralSignal/20 bg-neutralSignal-soft text-neutralSignal"
        }`}
      >
        {plan.dataNote}
      </p>

      {/* Trend + indicators */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Trend" value={`${plan.trend.direction} (${plan.trend.strength})`} />
        <Tile label="RSI" value={plan.indicators.rsi == null ? "—" : num(plan.indicators.rsi)} />
        <Tile label="EMA 9 / 20" value={fmtPair(plan.indicators.ema9, plan.indicators.ema20)} />
        <Tile label="ATR" value={plan.indicators.atr == null ? "—" : num(plan.indicators.atr)} />
      </div>

      {/* Support / resistance */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-bull/20 bg-bull-soft px-3 py-2">
          <p className="text-slate-400">Support</p>
          <p className="num font-semibold text-bull">
            {num(plan.levels.support1)} · {num(plan.levels.support2)}
          </p>
        </div>
        <div className="rounded-lg border border-bear/20 bg-bear-soft px-3 py-2">
          <p className="text-slate-400">Resistance</p>
          <p className="num font-semibold text-bear">
            {num(plan.levels.resistance1)} · {num(plan.levels.resistance2)}
          </p>
        </div>
      </div>

      {/* Long / short plans */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SidePlan title="Long Plan" tone="bull" entryLabel="Entry above" entry={plan.longPlan.entryAbove} side={plan.longPlan} />
        <SidePlan title="Short Plan" tone="bear" entryLabel="Entry below" entry={plan.shortPlan.entryBelow} side={plan.shortPlan} />
      </div>

      {/* Decision reason */}
      <p className="rounded-md border border-white/5 bg-base-800/40 px-3 py-2 text-xs text-slate-400">
        {plan.finalDecision.reason}
      </p>

      {/* Risk disclaimer (mandatory) */}
      <p className="rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[11px] leading-relaxed text-neutralSignal">
        ⚠️ {plan.riskDisclaimer}
      </p>
    </div>
  );
}

function SidePlan({
  title,
  tone,
  entryLabel,
  entry,
  side,
}: {
  title: string;
  tone: "bull" | "bear";
  entryLabel: string;
  entry?: number;
  side: LivePlanSide;
}) {
  const head = tone === "bull" ? "text-bull" : "text-bear";
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-sm font-semibold ${head}`}>{title}</p>
        <span className="num text-[11px] text-slate-500">R:R {side.riskReward}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Row k={entryLabel} v={entry == null ? "—" : num(entry)} />
        <Row k="Stop-loss" v={num(side.stopLoss)} tone="bear" />
        <Row k="Target 1" v={num(side.target1)} tone="bull" />
        <Row k="Target 2" v={num(side.target2)} tone="bull" />
        <Row k="Target 3" v={num(side.target3)} tone="bull" />
      </dl>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{side.condition}</p>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "bull" | "bear" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-200";
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className={`num text-right font-medium ${c}`}>{v}</dd>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-semibold capitalize text-slate-100">{value}</p>
    </div>
  );
}

function fmtPair(a: number | null, b: number | null): string {
  if (a == null && b == null) return "—";
  return `${a == null ? "—" : num(a)} / ${b == null ? "—" : num(b)}`;
}
