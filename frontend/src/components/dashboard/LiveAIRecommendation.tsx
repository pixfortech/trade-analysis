"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { ThemedSelect, InfoTooltip, InstrumentTypeSelector, type InstrumentSegment } from "@/components/ui/Inputs";
import { STRATEGY_MODES } from "@/lib/strategyModes";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { TimeBasedPlan } from "./TimeBasedPlan";
import type { LiveSignal, SignalAction } from "@/types/api";

const ACTION_CLS: Record<SignalAction, string> = {
  LONG: "border-bull/40 bg-bull-soft text-bull",
  SHORT: "border-bear/40 bg-bear-soft text-bear",
  WAIT: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  AVOID: "border-bear/40 bg-bear-soft text-bear",
};

/**
 * Live AI Recommendation — READ-ONLY, built ONLY from the live-signal endpoint
 * (real Kite data). No mock/sample values. Explains WHY it suggests the action
 * and shows entry/SL/targets/support/resistance/confidence with a risk note.
 */
export function LiveAIRecommendation() {
  const [sel, setSel] = useState<{ key: string; label: string } | null>({ key: "NSE:RELIANCE", label: "RELIANCE" });
  const [interval, setInterval] = useState("15minute");
  const [mode, setMode] = useState("balanced");
  const [segment, setSegment] = useState<InstrumentSegment>("all");
  const rec = useAsync(api.liveSignal);
  const global = useGlobalControls();

  const onSelect = (ins: SelectedInstrument) => setSel({ key: ins.instrument, label: ins.displayName });
  const run = useCallback(() => {
    if (!sel) return;
    void rec.run({ instrument: sel.key, interval, riskProfile: mode });
  }, [sel, interval, mode, rec]);

  // Auto-refresh when global live updates are ON (and a recommendation exists).
  useEffect(() => {
    if (!global.liveUpdates || !sel || !rec.data) return;
    const id = window.setInterval(() => run(), 5000);
    return () => window.clearInterval(id);
  }, [global.liveUpdates, sel, rec.data, run]);

  return (
    <Card
      id="ai-recommendation"
      title="AI Recommendation"
      subtitle="Live, explained advisory from real Kite data"
      action={
        <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          LIVE · READ-ONLY
        </span>
      }
    >
      <div className="mb-3">
        <InfoTooltip label="What is this?">
          A plain-language recommendation built from the same live analysis as the Live Market Signal (trend,
          momentum, VWAP, volume, support/resistance, volatility). It explains <strong>why</strong> it suggests
          LONG/SHORT/WAIT. <strong>Decision support only — no orders are placed.</strong>
        </InfoTooltip>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Type:</span>
        <InstrumentTypeSelector value={segment} onChange={setSegment} />
      </div>
      <InstrumentSearch onSelect={onSelect} placeholder="Instrument for recommendation…" segment={segment === "all" ? undefined : segment} />

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">Selected</p>
          <p className="truncate text-sm font-semibold text-slate-100">{sel?.label ?? "None"}</p>
        </div>
        <ThemedSelect
          value={interval}
          onChange={setInterval}
          ariaLabel="Timeframe"
          className="sm:w-32"
          options={["5minute", "15minute", "30minute", "60minute", "day"].map((i) => ({ value: i, label: i }))}
        />
        <ThemedSelect
          value={mode}
          onChange={setMode}
          ariaLabel="Strategy mode"
          className="sm:w-40"
          options={STRATEGY_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
        <button
          type="button"
          onClick={run}
          disabled={rec.isLoading || !sel}
          className="rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/30 disabled:opacity-40"
        >
          {rec.isLoading ? "Analyzing…" : "Get recommendation"}
        </button>
      </div>

      <div className="mt-4">
        {rec.isIdle && <EmptyState title="No recommendation yet" message="Pick an instrument and click Get recommendation. Needs live Kite data." />}
        {rec.isLoading && !rec.data && <p className="text-sm text-slate-400">Reading live data…</p>}
        {rec.isError && <ErrorState message={rec.error ?? "Failed."} hint="Enable & authorise Kite. This uses live data only." onRetry={run} />}
        {rec.data && <Recommendation s={rec.data} interval={interval} live={global.liveUpdates} />}
      </div>
    </Card>
  );
}

function Recommendation({ s, interval, live }: { s: LiveSignal; interval: string; live: boolean }) {
  const long = s.finalDecision.action === "LONG";
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = setup.entryAbove ?? setup.entryBelow ?? null;
  const tradeable = s.finalDecision.action === "LONG" || s.finalDecision.action === "SHORT";
  const ind = s.indicators;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="num truncate">{s.resolvedInstrument.instrumentKey}</span>
        <span>· {interval}</span>
        <span>· updated {new Date(s.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${live ? "border-bull/40 bg-bull-soft text-bull" : "border-white/10 bg-base-800 text-slate-400"}`}>
          {live ? "LIVE" : "paused"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="num text-2xl font-bold text-slate-100">{num(s.currentPrice)}</p>
          <p className="text-xs capitalize text-slate-500">
            Trend: {s.trend.direction} ({s.trend.strength})
          </p>
        </div>
        <div className="text-right">
          <span className={`rounded-xl border px-4 py-1.5 text-xl font-bold ${ACTION_CLS[s.finalDecision.action]}`}>
            {s.finalDecision.action}
          </span>
          <p className="mt-1 text-[11px] text-slate-500">confidence: {s.probability.confidence} · win est. {s.probability.estimatedWinPercent}%</p>
        </div>
      </div>

      {/* Why */}
      <div className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2.5 text-sm text-slate-300">
        <span className="font-semibold text-slate-100">Why: </span>
        {s.finalDecision.reason}
      </div>

      {/* Live indicator readouts (real values from backend; "—" when unavailable) */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="VWAP" value={s.marketData.vwap == null ? "—" : num(s.marketData.vwap)} small />
        <Stat label="EMA 20" value={ind.ema20 == null ? "—" : num(ind.ema20)} small />
        <Stat label="RSI" value={ind.rsi == null ? "—" : num(ind.rsi)} small />
        <Stat label="MACD" value={ind.macd == null ? "—" : num(ind.macd.histogram)} small />
        <Stat label="ADX" value={ind.adx == null ? "—" : num(ind.adx.adx)} small />
        <Stat label="ATR" value={ind.atr == null ? "—" : num(ind.atr)} small />
      </div>

      {/* Levels (only when tradeable; otherwise show support/resistance to watch) */}
      {tradeable ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Entry" value={entry == null ? "Unavailable" : num(entry)} />
          <Stat label="Stop-loss" value={num(setup.stopLoss)} tone="bear" />
          <Stat label="R : R" value={setup.riskReward} />
          <Stat label="Target 1" value={num(setup.target1)} tone="bull" />
          <Stat label="Target 2" value={num(setup.target2)} tone="bull" />
          <Stat label="Target 3" value={num(setup.target3)} tone="bull" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Support" value={`${num(s.levels.support1)} · ${num(s.levels.support2)}`} tone="bull" />
          <Stat label="Resistance" value={`${num(s.levels.resistance1)} · ${num(s.levels.resistance2)}`} tone="bear" />
        </div>
      )}

      {/* Risk warning tied to actual SL/target */}
      {tradeable && (
        <p className="rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[11px] leading-relaxed text-neutralSignal">
          Risk warning: if the stop-loss {num(setup.stopLoss)} is hit you lose ≈ {num(setup.riskPerUnit)} pts/unit.
          Never risk more than ~1% of capital — size accordingly (see Risk Management). Advisory only.
        </p>
      )}

      {/* How long to hold + when to exit */}
      <TimeBasedPlan signal={s} />

      <p className="rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[11px] leading-relaxed text-neutralSignal">
        ⚠️ {s.disclaimer}
      </p>
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: "bull" | "bear"; small?: boolean }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-100";
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`num font-semibold ${small ? "text-sm" : "text-[15px]"} ${c}`}>{value}</p>
    </div>
  );
}
