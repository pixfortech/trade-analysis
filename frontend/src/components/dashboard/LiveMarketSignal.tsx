"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import type { ChartDataResponse, IndicatorId, LiveSignal, SignalAction, SignalSetup } from "@/types/api";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { IndicatorControls, ALL_INDICATORS } from "./IndicatorControls";
import { LiveChart } from "./LiveChart";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertToasts } from "./AlertToasts";
import { ThemedSelect, InfoTooltip, InstrumentTypeSelector, type InstrumentSegment } from "@/components/ui/Inputs";
import { STRATEGY_MODES, modeBlurb } from "@/lib/strategyModes";
import { TimeBasedPlan } from "./TimeBasedPlan";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { Expandable } from "@/components/ui/Expandable";

const INTERVALS = ["1minute", "3minute", "5minute", "15minute", "30minute", "60minute", "day"];
const DEFAULT_ACTIVE: IndicatorId[] = ["VWAP", "EMA20", "EMA50", "RSI", "MACD", "ADX", "ATR", "SUPERTREND", "VOLUME", "OI"];

interface Selection {
  instrument: string;
  displayName: string;
  lotSize: number | null;
}

/**
 * Live Market Signal — primary READ-ONLY analysis card (Phase 3E/3F).
 * Search → live chart + indicator toggles + real-time polling. Recalculates
 * trend/probability/entry/exit when indicators change, and raises a toast +
 * (opt-in) browser notification on trend reversal. No order controls anywhere.
 */
export function LiveMarketSignal() {
  const [sel, setSel] = useState<Selection | null>({
    instrument: "NSE:RELIANCE",
    displayName: "RELIANCE",
    lotSize: null,
  });
  const [interval, setInterval] = useState("5minute");
  const [riskProfile, setRiskProfile] = useState("balanced");
  const [segment, setSegment] = useState<InstrumentSegment>("all");
  const [active, setActive] = useState<IndicatorId[]>(DEFAULT_ACTIVE);
  const [chart, setChart] = useState<ChartDataResponse | null>(null);
  const signal = useAsync(api.liveSignal);
  const alerts = useAlerts();
  const global = useGlobalControls();
  const prevTrend = useRef<string | null>(null);

  const onSelect = (ins: SelectedInstrument) => {
    setSel({ instrument: ins.instrument, displayName: ins.displayName, lotSize: ins.lotSize });
    prevTrend.current = null;
  };

  const toggleIndicator = (id: IndicatorId) =>
    setActive((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...ALL_INDICATORS].filter((x) => cur.includes(x) || x === id)));

  const fetchChart = useCallback(
    async (instrument: string) => {
      try {
        const c = await api.chartData({ instrument, interval, activeIndicators: active.join(",") });
        setChart(c);
      } catch {
        setChart(null); // chart needs candles; signal still works quote-only
      }
    },
    [interval, active],
  );

  const run = useCallback(async () => {
    if (!sel) return;
    const res = await signal.run({ instrument: sel.instrument, interval, riskProfile, activeIndicators: active.join(",") });
    if (res) {
      // Trend reversal detection (vs the previous successful read).
      const dir = res.trend.direction;
      if (prevTrend.current && prevTrend.current !== dir && (dir === "bullish" || dir === "bearish") && prevTrend.current !== "sideways") {
        const flip = `${prevTrend.current}→${dir}`;
        alerts.push(
          `reversal-${sel.instrument}`,
          `Trend changed: ${dir.toUpperCase()}`,
          `${res.resolvedInstrument.displayName}: ${prevTrend.current} → ${dir}. ${res.finalDecision.reason}`,
          dir === "bearish" ? "urgent" : "caution",
        );
        void flip;
      }
      prevTrend.current = dir;
    }
    void fetchChart(sel.instrument);
  }, [sel, interval, riskProfile, active, signal, alerts, fetchChart]);

  // Real-time polling driven by the GLOBAL live-updates control. Re-runs the
  // signal+chart every 5s while live updates are ON and an analysis exists.
  useEffect(() => {
    if (!global.liveUpdates || !sel || !signal.data) return;
    const id = window.setInterval(() => void run(), 5000);
    return () => window.clearInterval(id);
  }, [global.liveUpdates, sel, signal.data, run]);

  return (
    <Card
      id="live-market-signal"
      title="Live Market Signal"
      subtitle="Advisory LONG / SHORT / WAIT from live Kite data"
      action={
        <span className="rounded-full border border-bull/30 bg-bull-soft px-3 py-1 text-xs font-semibold text-bull">
          LIVE KITE · READ-ONLY
        </span>
      }
    >
      {/* What is this? */}
      <div className="mb-3">
        <InfoTooltip label="What is this?">
          Analyses <strong>live &amp; historical</strong> data (trend via EMA/Supertrend/ADX, momentum via RSI/MACD,
          VWAP, volume confirmation, support/resistance and ATR volatility) to produce an advisory
          <strong> LONG / SHORT / WAIT</strong> signal with entry, stop-loss and targets. It is{" "}
          <strong>read-only decision support — it never places orders</strong>. Source: Zerodha Kite live/historical
          data via the backend.
        </InfoTooltip>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Type:</span>
        <InstrumentTypeSelector value={segment} onChange={setSegment} />
      </div>
      <InstrumentSearch onSelect={onSelect} autoFocus={false} segment={segment === "all" ? undefined : segment} />

      {/* Selected instrument + controls */}
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1 rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
          <p className="text-xs text-slate-500">Selected instrument</p>
          <p className="truncate text-base font-semibold text-slate-100">
            {sel ? sel.displayName : "None"}{" "}
            <span className="num text-xs text-slate-500">
              {sel ? `· ${sel.instrument}${sel.lotSize ? ` · lot ${sel.lotSize}` : ""}` : ""}
            </span>
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Timeframe</span>
          <ThemedSelect
            value={interval}
            onChange={setInterval}
            ariaLabel="Timeframe"
            className="w-full lg:w-32"
            options={INTERVALS.map((i) => ({ value: i, label: i }))}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
            Strategy mode
            <InfoTooltip label="?">
              <span className="space-y-1.5">
                {STRATEGY_MODES.map((m) => (
                  <span key={m.value} className="block">
                    <strong className="text-slate-100">{m.label}:</strong> {m.blurb}
                  </span>
                ))}
              </span>
            </InfoTooltip>
          </span>
          <ThemedSelect
            value={riskProfile}
            onChange={setRiskProfile}
            ariaLabel="Strategy mode"
            className="w-full lg:w-44"
            options={STRATEGY_MODES.map((m) => ({ value: m.value, label: m.label }))}
          />
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={signal.isLoading || !sel}
          className="rounded-lg bg-accent/20 px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {signal.isLoading ? "Analyzing…" : "Analyze"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">{modeBlurb(riskProfile)}</p>

      {/* Live status — controlled globally from the top control bar */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        {global.liveUpdates && signal.data ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bull/40 bg-bull-soft px-2.5 py-0.5 font-semibold text-bull">
            <span className="h-1.5 w-1.5 rounded-full bg-bull" /> Live (auto-refresh 5s)
          </span>
        ) : (
          <span className="rounded-full border border-white/10 bg-base-800/60 px-2.5 py-0.5">
            Live updates {global.liveUpdates ? "ON" : "OFF"} — toggle in the top bar
          </span>
        )}
        <span>· Reversal alerts are advisory only.</span>
      </div>

      {/* Indicator toggles + contributions */}
      <div className="mt-3">
        <IndicatorControls active={active} onToggle={toggleIndicator} contributions={signal.data?.indicatorContributions} />
      </div>

      <div className="mt-4">
        {signal.isIdle && (
          <EmptyState
            title="Search and analyze"
            message="Pick an instrument above (equity, index, future or option) and click Analyze for a live read-only signal. Needs Kite enabled & authorised."
          />
        )}
        {signal.isLoading && !signal.data && <p className="text-sm text-slate-400">Fetching live data and computing the signal…</p>}
        {signal.isError && (
          <ErrorState
            message={signal.error ?? "Analysis failed."}
            hint="Enable & authorise Kite (Status card). If search is empty, refresh the instruments cache. Live signal needs live Kite data."
            onRetry={() => void run()}
          />
        )}
        {signal.data && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span>Source: Zerodha Kite (live/historical)</span>
              <span>· Timeframe: {interval}</span>
              <span>· Mode: <span className="capitalize">{riskProfile}</span></span>
              <span>· Updated: {formatTime(signal.data.timestamp)}</span>
            </div>
            {chart && chart.candles.length > 0 && (
              <div className="mb-4 rounded-lg border border-white/5 bg-base-800/30 p-2">
                <LiveChart data={chart} priceLines={priceLinesFor(signal.data)} />
              </div>
            )}
            <Expandable title={`Live Market Signal — ${signal.data.resolvedInstrument.displayName || signal.data.instrument}`}>
              <SignalView s={signal.data} />
              <TimeBasedPlan signal={signal.data} />
            </Expandable>
          </>
        )}
      </div>

      <AlertToasts toasts={alerts.toasts} onDismiss={alerts.dismiss} />
    </Card>
  );
}

/** Local IST-ish time formatter for the "last updated" line. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Entry/SL/target price lines for the chart, from the preferred setup. */
function priceLinesFor(s: LiveSignal): { price: number; color: string; title: string }[] {
  const setup = s.preferredSetup === "short" ? s.shortSetup : s.longSetup;
  const entry = setup.entryAbove ?? setup.entryBelow;
  const lines: { price: number; color: string; title: string }[] = [];
  if (entry != null) lines.push({ price: entry, color: "#3b82f6", title: "Entry" });
  lines.push({ price: setup.stopLoss, color: "#ea3943", title: "SL" });
  lines.push({ price: setup.target1, color: "#16c784", title: "T1" });
  lines.push({ price: setup.target2, color: "#16c784", title: "T2" });
  return lines;
}

const ACTION_CLS: Record<SignalAction, string> = {
  LONG: "border-bull/40 bg-bull-soft text-bull",
  SHORT: "border-bear/40 bg-bear-soft text-bear",
  WAIT: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  AVOID: "border-bear/40 bg-bear-soft text-bear",
};

function SignalView({ s }: { s: LiveSignal }) {
  return (
    <div className="space-y-5">
      {/* Top: price + decision */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{s.resolvedInstrument.displayName || s.instrument}</p>
          <p className="num text-3xl font-bold text-slate-100">{num(s.currentPrice)}</p>
          <p className="num text-sm text-slate-500">prev {num(s.marketData.previousClose)}{s.marketData.vwap != null ? ` · VWAP ${num(s.marketData.vwap)}` : ""}</p>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-xl border px-5 py-2 text-2xl font-bold ${ACTION_CLS[s.finalDecision.action]}`}>
            {s.finalDecision.action}
          </span>
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
            {s.probability.confidence} confidence · {s.probability.dataQuality}
          </p>
        </div>
      </div>

      {/* Probability bar */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium text-bull">Bullish {s.probability.bullishPercent}%</span>
          <span className="text-slate-400">Win (est.) {s.probability.estimatedWinPercent}%</span>
          <span className="font-medium text-bear">{s.probability.bearishPercent}% Bearish</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-base-700">
          <div className="bg-bull" style={{ width: `${s.probability.bullishPercent}%` }} />
          <div className="bg-bear" style={{ width: `${s.probability.bearishPercent}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Trend: <span className="capitalize text-slate-300">{s.trend.direction} ({s.trend.strength})</span> · {s.trend.reason}
        </p>
      </div>

      {/* Indicators + levels */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="RSI 14" value={s.indicators.rsi == null ? "—" : num(s.indicators.rsi)} />
        <Tile label="EMA 9 / 20" value={pair(s.indicators.ema9, s.indicators.ema20)} />
        <Tile label="ATR 14" value={s.indicators.atr == null ? "—" : num(s.indicators.atr)} />
        <Tile label="Volume" value={s.indicators.volumeConfirmed == null ? "—" : s.indicators.volumeConfirmed ? "Confirmed" : "Low"} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-bull/20 bg-bull-soft px-3 py-2.5">
          <p className="text-slate-400">Support</p>
          <p className="num text-[15px] font-semibold text-bull">{num(s.levels.support1)} · {num(s.levels.support2)}</p>
        </div>
        <div className="rounded-lg border border-bear/20 bg-bear-soft px-3 py-2.5">
          <p className="text-slate-400">Resistance</p>
          <p className="num text-[15px] font-semibold text-bear">{num(s.levels.resistance1)} · {num(s.levels.resistance2)}</p>
        </div>
      </div>

      {/* Long / short setups */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SetupView title="Long Setup" tone="bull" entryLabel="Entry above" entry={s.longSetup.entryAbove} setup={s.longSetup} />
        <SetupView title="Short Setup" tone="bear" entryLabel="Entry below" entry={s.shortSetup.entryBelow} setup={s.shortSetup} />
      </div>

      {/* Decision reason */}
      <p className="rounded-lg border border-white/5 bg-base-800/40 px-4 py-3 text-sm text-slate-300">
        <span className="font-semibold text-slate-100">Decision:</span> {s.finalDecision.reason}{" "}
        <span className="text-slate-500">(invalidation {num(s.finalDecision.invalidationLevel)})</span>
      </p>

      {/* Disclaimer (mandatory) */}
      <p className="rounded-lg border border-neutralSignal/20 bg-neutralSignal-soft px-4 py-3 text-xs leading-relaxed text-neutralSignal">
        ⚠️ {s.disclaimer}
      </p>
    </div>
  );
}

function SetupView({
  title,
  tone,
  entryLabel,
  entry,
  setup,
}: {
  title: string;
  tone: "bull" | "bear";
  entryLabel: string;
  entry?: number;
  setup: SignalSetup;
}) {
  const head = tone === "bull" ? "text-bull" : "text-bear";
  const statusCls =
    setup.status === "active"
      ? tone === "bull"
        ? "border-bull/40 bg-bull-soft text-bull"
        : "border-bear/40 bg-bear-soft text-bear"
      : "border-white/10 bg-base-800 text-slate-400";
  return (
    <div className="rounded-xl border border-white/5 bg-base-800/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className={`text-base font-semibold ${head}`}>{title}</p>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${statusCls}`}>
          {setup.status}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Level label={entryLabel} value={entry} big />
        <Level label="Stop-loss" value={setup.stopLoss} tone="bear" big />
        <Level label="Target 1" value={setup.target1} tone="bull" />
        <Level label="Target 2" value={setup.target2} tone="bull" />
        <Level label="Target 3" value={setup.target3} tone="bull" />
        <Level label={`R:R`} text={setup.riskReward} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-bull/20 bg-bull-soft px-3 py-2 text-center">
          <p className="text-[11px] text-slate-400">Est. profit / lot</p>
          <p className="num text-[15px] font-semibold text-bull">{num(setup.estimatedProfitForOneLot)}</p>
        </div>
        <div className="rounded-lg border border-bear/20 bg-bear-soft px-3 py-2 text-center">
          <p className="text-[11px] text-slate-400">Est. loss / lot</p>
          <p className="num text-[15px] font-semibold text-bear">{num(setup.estimatedLossForOneLot)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{setup.condition}</p>
    </div>
  );
}

function Level({
  label,
  value,
  text,
  tone,
  big,
}: {
  label: string;
  value?: number;
  text?: string;
  tone?: "bull" | "bear";
  big?: boolean;
}) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-100";
  const size = big ? "text-xl" : "text-base";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`num font-bold ${size} ${c}`}>{text ?? (value == null ? "—" : `₹${num(value)}`)}</span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-[15px] font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function pair(a: number | null, b: number | null): string {
  if (a == null && b == null) return "—";
  return `${a == null ? "—" : num(a)} / ${b == null ? "—" : num(b)}`;
}
