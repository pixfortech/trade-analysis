"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num, tsec } from "@/lib/format";
import { actionToneFor, toneVisual } from "@/lib/actionStyles";
import type { ChartDataResponse, IndicatorId, LiveSignal, SignalSetup } from "@/types/api";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { LiveChart } from "./LiveChart";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertToasts } from "./AlertToasts";
import { ThemedSelect, InfoTooltip, InstrumentTypeSelector, type InstrumentSegment } from "@/components/ui/Inputs";
import { STRATEGY_MODES, modeBlurb } from "@/lib/strategyModes";
import { TimeBasedPlan } from "./TimeBasedPlan";
import { TradeGuidance } from "./TradeGuidance";
import { OhlcStrip, IndicatorGroups } from "./MarketContext";
import { useGlobalControls, exchangeOfKey, type SharedInstrument } from "@/hooks/useGlobalControls";
import { Expandable } from "@/components/ui/Expandable";
import { buildTradePlan, evaluatePlan, type TradePlanSnapshot } from "@/lib/tradePlan";

const INTERVALS = ["1minute", "3minute", "5minute", "15minute", "30minute", "60minute", "day"];
const DEFAULT_ACTIVE: IndicatorId[] = ["VWAP", "EMA20", "EMA50", "RSI", "MACD", "ADX", "ATR", "SUPERTREND", "VOLUME", "OI"];

/**
 * Live Market Signal — primary READ-ONLY analysis card (Phase 3E/3F).
 * Search → live chart + indicator toggles + real-time polling. Recalculates
 * trend/probability/entry/exit when indicators change, and raises a toast +
 * (opt-in) browser notification on trend reversal. No order controls anywhere.
 * The selected instrument is shared globally (Live Signal / AI Rec / assistant).
 */
export function LiveMarketSignal() {
  const global = useGlobalControls();
  const sel = global.selectedInstrument;
  const [interval, setInterval] = useState("5minute");
  const [riskProfile, setRiskProfile] = useState("balanced");
  const [segment, setSegment] = useState<InstrumentSegment>("all");
  // Fixed indicator set (the old toggle/recalculate table was removed; the
  // grouped indicator section below is summary-first and read-only).
  const active = DEFAULT_ACTIVE;
  const [chart, setChart] = useState<ChartDataResponse | null>(null);
  const signal = useAsync(api.liveSignal);
  const alerts = useAlerts();
  const prevTrend = useRef<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  // The LOCKED trade plan (entry/SL/targets/confidence) for this analysis cycle.
  // CMP/indicators keep updating via `signal`; these levels do NOT move per tick.
  const [plan, setPlan] = useState<TradePlanSnapshot | null>(null);
  // Best-effort India VIX (volatility context for the timing estimate). Unavailable
  // → the estimate falls back to ATR and labels VIX unavailable; never fabricated.
  const [vix, setVix] = useState<number | null>(null);

  // Reference-only instruments (e.g. GIFT NIFTY on NSEIX) are visible/selectable
  // but Kite can't quote them, so we never call live-signal with them.
  const referenceOnly = !!sel && sel.quotable === false;

  const onSelect = (ins: SelectedInstrument) => {
    global.setSelectedInstrument({ instrument: ins.instrument, displayName: ins.displayName, lotSize: ins.lotSize, quotable: ins.quotable, name: ins.name });
    prevTrend.current = null;
    setResolveNote(null);
  };

  // Map a reference instrument to its nearest tradable future via Kite search.
  const chooseNearestTradable = useCallback(async () => {
    if (!sel) return;
    setResolving(true);
    setResolveNote(null);
    try {
      const underlying = underlyingFor(sel);
      const res = await api.kite.instrumentsSearch({ q: underlying, segment: "futures", limit: 3 });
      const fut = res.groups.futures.find((f) => f.quotable) ?? res.groups.futures[0];
      if (fut) {
        global.setSelectedInstrument({ instrument: fut.instrument, displayName: fut.displayName, lotSize: fut.lotSize, quotable: fut.quotable, name: fut.name });
        prevTrend.current = null;
      } else {
        setResolveNote(`No tradable ${underlying} future found in the Kite cache. Try refreshing the instruments cache.`);
      }
    } catch {
      setResolveNote("Couldn't resolve a nearest future. Refresh the instruments cache and try again.");
    } finally {
      setResolving(false);
    }
  }, [sel, global]);

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

  // Live refresh: updates CMP + indicators (and chart) WITHOUT touching the
  // locked plan. Returns the latest signal so `analyze` can lock a fresh plan.
  const run = useCallback(async (): Promise<LiveSignal | null> => {
    if (!sel || sel.quotable === false) return null; // never analyse a reference-only key
    const res = await signal.run({ instrument: sel.instrument, interval, riskProfile, activeIndicators: active.join(",") });
    if (res) {
      // Trend reversal detection (vs the previous successful read).
      const dir = res.trend.direction;
      if (prevTrend.current && prevTrend.current !== dir && (dir === "bullish" || dir === "bearish") && prevTrend.current !== "sideways") {
        alerts.push(
          `reversal-${sel.instrument}`,
          `Trend changed: ${dir.toUpperCase()}`,
          `${res.resolvedInstrument.displayName}: ${prevTrend.current} → ${dir}. ${res.finalDecision.reason}`,
          dir === "bearish" ? "urgent" : "caution",
        );
      }
      prevTrend.current = dir;
    }
    void fetchChart(sel.instrument);
    return res ?? null;
  }, [sel, interval, riskProfile, active, signal, alerts, fetchChart]);

  // Analyze / Re-analyse: refresh live data AND LOCK a fresh trade plan.
  const analyze = useCallback(async () => {
    const res = await run();
    if (res) setPlan(buildTradePlan(res, interval, riskProfile));
  }, [run, interval, riskProfile]);

  // Levels are locked per analysis cycle — clear the plan (forcing a fresh
  // Re-analyse) when the instrument, timeframe or strategy mode changes.
  useEffect(() => {
    setPlan(null);
  }, [sel?.instrument, interval, riskProfile]);

  // Real-time polling driven by the GLOBAL live-updates control. Refreshes
  // CMP/indicators every 5s while live updates are ON and an analysis exists —
  // the locked plan's levels are NOT recalculated here.
  useEffect(() => {
    if (!global.liveUpdates || !sel || !signal.data) return;
    const id = window.setInterval(() => void run(), 5000);
    return () => window.clearInterval(id);
  }, [global.liveUpdates, sel, signal.data, run]);

  // Best-effort India VIX via the existing quote endpoint (read-only). Resilient:
  // if it isn't quotable / subscribed, vix stays null and timing computes without it.
  useEffect(() => {
    if (!signal.data) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.kite.quote("NSE:INDIA VIX");
        const first = res?.data ? (Object.values(res.data)[0] as { last_price?: number } | undefined) : undefined;
        const lp = first?.last_price;
        if (!cancelled) setVix(typeof lp === "number" && lp > 0 ? lp : null);
      } catch {
        if (!cancelled) setVix(null);
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [signal.data]);

  // Reflow the grid once a result arrives so the summary/indicators fit cleanly.
  useEffect(() => {
    if (!signal.data) return;
    const timers = [0, 120, 320].map((ms) => window.setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [signal.data]);

  // Refresh the Kite instruments cache, then re-analyse (used by the error state).
  const refreshCache = useCallback(async () => {
    try {
      await api.kite.instrumentsRefresh();
    } catch {
      /* ignore — analyze() surfaces any remaining issue */
    }
    void analyze();
  }, [analyze]);

  return (
    <Card
      id="live-market-signal"
      title="Live Market Signal"
      subtitle="Advisory LONG / SHORT / WAIT from live Kite data"
      eyebrow="Primary signal"
      action={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-bull/40 bg-bull-soft px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-bull">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bull" />
          </span>
          Live Kite · Read-only
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
      <div className="mt-3 flex flex-col gap-2.5 lg:flex-row lg:items-end">
        <div className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 ${sel ? "border-accent/20 bg-accent/5" : "border-white/5 bg-base-800/60"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow text-slate-500">Selected instrument</p>
            {sel && (
              <button type="button" onClick={() => global.setSelectedInstrument(null)} className="text-[11px] font-medium text-slate-500 hover:text-bear">
                Clear ✕
              </button>
            )}
          </div>
          {sel ? (
            <>
              <p className="truncate text-base font-bold text-slate-100">
                {sel.displayName}
                <span className="num ml-1 text-xs font-medium text-slate-500">· {sel.instrument}{sel.lotSize ? ` · lot ${sel.lotSize}` : ""}</span>
              </p>
              <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${sel.quotable ? "border-bull/40 bg-bull-soft text-bull" : "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal"}`}>
                {sel.quotable ? "Kite direct" : "Reference only — map to tradable"}
              </span>
            </>
          ) : (
            <p className="text-sm font-medium text-slate-400">None — search above to select</p>
          )}
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
          onClick={() => void analyze()}
          disabled={signal.isLoading || !sel || referenceOnly}
          title={referenceOnly ? "Reference-only instrument — choose a nearest tradable instrument first" : "Lock a fresh trade plan from current structure"}
          className="rounded-lg bg-accent/20 px-5 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {signal.isLoading ? "Analyzing…" : plan ? "Re-analyse" : "Analyze"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">{modeBlurb(riskProfile)}</p>

      {/* Live status — controlled globally from the top control bar */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        {!global.liveUpdates ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutralSignal/40 bg-neutralSignal-soft px-2.5 py-0.5 font-semibold text-neutralSignal">
            ⏸ Live paused — manual refresh only (toggle in top bar)
          </span>
        ) : signal.data ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bull/40 bg-bull-soft px-2.5 py-0.5 font-semibold text-bull">
            <span className="h-1.5 w-1.5 rounded-full bg-bull" /> Live (auto-refresh 5s)
          </span>
        ) : (
          <span className="rounded-full border border-white/10 bg-base-800/60 px-2.5 py-0.5">Live updates ON</span>
        )}
        <span>· Reversal alerts are advisory only.</span>
      </div>

      <div className="mt-4">
        {!sel ? (
          <EmptyState
            title="Search and select an instrument to analyse"
            message="Pick an equity, index, future or option above. Nothing is selected by default."
          />
        ) : referenceOnly ? (
          <ReferenceCard
            sel={sel}
            resolving={resolving}
            note={resolveNote}
            onMap={() => void chooseNearestTradable()}
            onRefresh={() => void refreshCache()}
            onClear={() => global.setSelectedInstrument(null)}
          />
        ) : signal.isIdle ? (
          <EmptyState title={`Ready: ${sel.displayName}`} message="Click Analyze for a live read-only signal. Needs Kite enabled & authorised." />
        ) : signal.isLoading && !signal.data ? (
          <p className="text-sm text-slate-400">Fetching live data and computing the signal…</p>
        ) : signal.isError ? (
          <InstrumentError name={sel.displayName} message={signal.error} onRetry={() => void analyze()} onRefresh={() => void refreshCache()} onClear={() => global.setSelectedInstrument(null)} />
        ) : signal.data ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span>Source: Zerodha Kite (live/historical)</span>
              <span>· Timeframe: {interval}</span>
              <span>· Mode: <span className="capitalize">{riskProfile}</span></span>
              <span>· Updated: {formatTime(signal.data.timestamp)}</span>
            </div>
            {/* OHLC + event-time context strip (high/low times derived from candles) */}
            <div className="mb-4">
              <OhlcStrip signal={signal.data} chart={chart} />
            </div>
            {/* LOCKED trade plan — entry/SL/targets stay fixed; CMP stays live. */}
            {plan ? (
              <div className="mb-4">
                <TradeGuidance plan={plan} evalResult={evaluatePlan(plan, signal.data.currentPrice, signal.data, null)} signal={signal.data} vix={vix} onReanalyse={() => void analyze()} />
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-slate-300">
                Live data is loaded. Click{" "}
                <button type="button" onClick={() => void analyze()} className="font-semibold text-accent underline underline-offset-2">Analyze</button>{" "}
                to lock a trade plan (entry, stop-loss, targets) for {interval} · <span className="capitalize">{riskProfile}</span>.
              </div>
            )}
            {/* Indicators — the single, grouped & collapsible indicator section */}
            <div className="mb-4">
              <IndicatorGroups signal={signal.data} />
            </div>
            {chart && chart.candles.length > 0 && (
              <div className="mb-4 rounded-lg border border-white/5 bg-base-800/30 p-2">
                <LiveChart data={chart} priceLines={plan ? planPriceLines(plan) : priceLinesFor(signal.data)} />
              </div>
            )}
            <Expandable title={`Live Market Signal — ${signal.data.resolvedInstrument.displayName || signal.data.instrument}`}>
              <SignalView s={signal.data} />
              <TimeBasedPlan signal={signal.data} />
            </Expandable>
          </>
        ) : null}
      </div>

      <AlertToasts toasts={alerts.toasts} onDismiss={alerts.dismiss} />
    </Card>
  );
}

/** Local IST-ish time formatter for the "last updated" line. */
function formatTime(iso: string): string {
  return tsec(iso);
}

/** Friendly error/unavailable state for a selected instrument (e.g. GIFT/NSEIX). */
function InstrumentError({ name, message, onRetry, onRefresh, onClear }: { name: string; message: string | null; onRetry: () => void; onRefresh: () => void; onClear: () => void }) {
  const friendly = !!message && /(not found|resolve|unsupported|invalid|no candle|instrument|unavailable|cache|nseix|gift)/i.test(message);
  return (
    <div className="rounded-xl border border-neutralSignal/30 bg-neutralSignal-soft p-4">
      <p className="text-sm font-bold text-neutralSignal">{friendly ? `${name} is currently unavailable in Kite data` : "Couldn't compute the signal"}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {friendly
          ? "It may not be quotable via Kite (e.g. GIFT / NSEIX), or the instruments cache is stale. Refresh the cache, or clear the selection and pick another instrument."
          : "Enable & authorise Kite (see the Kite Status card), then retry. The live signal needs live Kite data."}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/5">Retry</button>
        <button type="button" onClick={onRefresh} className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20">Refresh instruments cache</button>
        <button type="button" onClick={onClear} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-bear">Clear selection</button>
      </div>
    </div>
  );
}

/** Reference-only instrument (e.g. GIFT NIFTY / NSEIX): visible, not quotable. */
function ReferenceCard({ sel, resolving, note, onMap, onRefresh, onClear }: { sel: SharedInstrument; resolving: boolean; note: string | null; onMap: () => void; onRefresh: () => void; onClear: () => void }) {
  const ex = exchangeOfKey(sel.instrument);
  return (
    <div className="rounded-xl border border-neutralSignal/30 bg-neutralSignal-soft p-4">
      <div className="flex items-center gap-2">
        <span className="rounded border border-neutralSignal/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutralSignal">Reference</span>
        <p className="text-sm font-bold text-neutralSignal">Index / reference instrument</p>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
        <strong className="text-slate-200">{sel.displayName}</strong> is visible, but not directly quoteable via the current Kite instrument cache
        {ex ? ` (exchange ${ex})` : ""}. Choose a mapped / nearest tradable instrument for live analysis.
      </p>
      {note && <p className="mt-1.5 text-xs font-medium text-bear">{note}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={onMap} disabled={resolving} className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50">
          {resolving ? "Finding nearest future…" : "Choose nearest tradable instrument"}
        </button>
        <button type="button" onClick={onRefresh} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/5">Refresh instruments cache</button>
        <button type="button" onClick={onClear} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-bear">Clear selection</button>
      </div>
    </div>
  );
}

/** Best-effort underlying name for resolving a reference instrument to a future. */
function underlyingFor(sel: SharedInstrument): string {
  const key = sel.instrument.toUpperCase();
  const n = (sel.name || sel.displayName || "").toUpperCase();
  if (key.includes("GIFT") || n.includes("GIFT") || n.includes("SGX")) return "NIFTY";
  const cleaned = n.replace(/\(INDEX\)/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "NIFTY";
}

/** Entry/SL/target price lines for the chart, from the preferred setup. */
function priceLinesFor(s: LiveSignal): { price: number; color: string; title: string }[] {
  const setup = s.preferredSetup === "short" ? s.shortSetup : s.longSetup;
  const entry = setup.entryAbove ?? setup.entryBelow;
  const lines: { price: number; color: string; title: string }[] = [];
  if (entry != null) lines.push({ price: entry, color: LINE.entry, title: "Entry" });
  lines.push({ price: setup.stopLoss, color: LINE.sl, title: "SL" });
  lines.push({ price: setup.target1, color: LINE.target, title: "T1" });
  lines.push({ price: setup.target2, color: LINE.target, title: "T2" });
  return lines;
}

// Chart price-line colours mirror the design tokens (accent / bear / bull).
const LINE = { entry: "#5b82ee", sl: "#f04438", target: "#12b76a" } as const;

/** Chart price lines from the LOCKED plan (so the chart matches the plan). */
function planPriceLines(p: TradePlanSnapshot): { price: number; color: string; title: string }[] {
  const lines: { price: number; color: string; title: string }[] = [];
  if (p.entry != null) lines.push({ price: p.entry, color: LINE.entry, title: "Entry" });
  if (p.stopLoss != null) lines.push({ price: p.stopLoss, color: LINE.sl, title: "SL" });
  if (p.targets[0] != null) lines.push({ price: p.targets[0], color: LINE.target, title: "T1" });
  if (p.targets[1] != null) lines.push({ price: p.targets[1], color: LINE.target, title: "T2" });
  return lines;
}

function SignalView({ s }: { s: LiveSignal }) {
  return (
    <div className="space-y-5">
      {/* Top: price + decision */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{s.resolvedInstrument.displayName || s.instrument}</p>
          <p className="num text-4xl font-bold leading-none tracking-tight text-slate-100">{num(s.currentPrice)}</p>
          <p className="num mt-1 text-sm text-slate-500">prev {num(s.marketData.previousClose)}{s.marketData.vwap != null ? ` · VWAP ${num(s.marketData.vwap)}` : ""}</p>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-xl border px-5 py-2 text-2xl font-extrabold tracking-tight ${toneVisual(actionToneFor(s.finalDecision.action)).chip}`}>
            {s.finalDecision.action}
          </span>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
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

