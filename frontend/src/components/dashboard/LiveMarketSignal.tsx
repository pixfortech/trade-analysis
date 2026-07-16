"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import type { ChartDataResponse, IndicatorId, LiveSignal } from "@/types/api";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { LiveChart } from "./LiveChart";
import { IndicatorsPanel } from "./IndicatorsPanel";
import { OscillatorCards } from "./OscillatorCards";
import { DEFAULT_INDICATORS, type IndicatorInstance } from "@/lib/chartIndicators";
import { useTheme } from "@/hooks/useTheme";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertToasts } from "./AlertToasts";
import { ThemedSelect, InstrumentTypeSelector, type InstrumentSegment } from "@/components/ui/Inputs";
import { STRATEGY_MODES } from "@/lib/strategyModes";
import { OhlcStrip } from "./MarketContext";
import { DecisionStrip } from "./DecisionStrip";
import { EvidenceTabs } from "./EvidenceTabs";
import { useDecision } from "@/hooks/useDecision";
import { useMonitoringSession } from "@/hooks/useMonitoringSession";
import { fmtMarketTime } from "@/lib/marketTime";
import { useGlobalControls, exchangeOfKey, type SharedInstrument } from "@/hooks/useGlobalControls";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import { Icon } from "@/components/terminal/ds";
import { buildTradePlan, evaluatePlan, type TradePlanSnapshot } from "@/lib/tradePlan";

// Kite-supported candle intervals (API enum — not a tunable business value).
const INTERVALS = ["1minute", "3minute", "5minute", "15minute", "30minute", "60minute", "day"];

/**
 * Live Market Signal cockpit — READ-ONLY. Summary-first information architecture:
 * a compact instrument header, ONE primary decision strip (action/approval/win/
 * levels/context), the chart near the top, and all secondary evidence inside a
 * tabbed panel. No duplicate decision cards; Market Movers lives in the rail.
 */
export function LiveMarketSignal() {
  const global = useGlobalControls();
  const cfg = usePublicConfig();
  const sel = global.selectedInstrument;
  const [interval, setInterval] = useState("5minute");
  const [riskProfile, setRiskProfile] = useState("balanced");
  const [segment, setSegment] = useState<InstrumentSegment>("all");
  const active = useMemo<IndicatorId[]>(() => cfg.defaults.activeIndicators as IndicatorId[], [cfg.defaults.activeIndicators]);
  const [chart, setChart] = useState<ChartDataResponse | null>(null);
  const signal = useAsync(api.liveSignal);
  const alerts = useAlerts();
  const prevTrend = useRef<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  // LOCKED trade plan (entry/SL/targets) — CMP/indicators keep updating; levels don't.
  const [plan, setPlan] = useState<TradePlanSnapshot | null>(null);
  const [vix, setVix] = useState<number | null>(null);
  const { theme } = useTheme();
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const { value: indicators, setValue: setIndicators } = useLocalStorage<IndicatorInstance[]>("cockpit.indicators.chart.v1", DEFAULT_INDICATORS);

  const referenceOnly = !!sel && sel.quotable === false;

  // Real-time decision snapshot (single source of truth) for the strip + tabs.
  const dec = useDecision(sel && sel.quotable !== false ? sel.instrument : null, interval, riskProfile, global.liveUpdates);
  const evalResult = plan && signal.data ? evaluatePlan(plan, signal.data.currentPrice, signal.data, null) : null;

  // Continuous monitoring session (baseline + movement/MFE/MAE/distance + last-tick
  // timestamps). Created on Analyse; resets on instrument/timeframe/mode change.
  const mon = useMonitoringSession({ plan, signal: signal.data ?? null, decision: dec.d, chart, instrument: sel && sel.quotable !== false ? sel.instrument : null, interval, riskProfile, live: global.liveUpdates });
  const monitorSummary = mon.session ? { analysedCmp: mon.session.analysedCmp, liveCmp: mon.liveCmp, movement: mon.movement, movementPct: mon.movementPct, distToTrigger: mon.distToTrigger, candleState: mon.candleState } : null;
  const tz = cfg.session.timezone;

  const onSelect = (ins: SelectedInstrument) => {
    global.setSelectedInstrument({ instrument: ins.instrument, displayName: ins.displayName, lotSize: ins.lotSize, quotable: ins.quotable, name: ins.name });
    prevTrend.current = null;
    setResolveNote(null);
  };

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
        setChart(null);
      }
    },
    [interval, active],
  );

  const run = useCallback(async (): Promise<LiveSignal | null> => {
    if (!sel || sel.quotable === false) return null;
    const res = await signal.run({ instrument: sel.instrument, interval, riskProfile, activeIndicators: active.join(",") });
    if (res) {
      const dir = res.trend.direction;
      if (prevTrend.current && prevTrend.current !== dir && (dir === "bullish" || dir === "bearish") && prevTrend.current !== "sideways") {
        alerts.push(`reversal-${sel.instrument}`, `Trend changed: ${dir.toUpperCase()}`, `${res.resolvedInstrument.displayName}: ${prevTrend.current} → ${dir}. ${res.finalDecision.reason}`, dir === "bearish" ? "urgent" : "caution");
      }
      prevTrend.current = dir;
    }
    void fetchChart(sel.instrument);
    return res ?? null;
  }, [sel, interval, riskProfile, active, signal, alerts, fetchChart]);

  const analyze = useCallback(async () => {
    const res = await run();
    if (res) setPlan(buildTradePlan(res, interval, riskProfile));
    void dec.reload();
  }, [run, interval, riskProfile, dec]);

  // Levels are locked per cycle — clear on instrument / timeframe / mode change.
  useEffect(() => { setPlan(null); }, [sel?.instrument, interval, riskProfile]);

  // Live polling (CMP/indicators) — locked plan levels are NOT recalculated here.
  useEffect(() => {
    if (!global.liveUpdates || !sel || !signal.data) return;
    const id = window.setInterval(() => void run(), cfg.refresh.liveSignalMs);
    return () => window.clearInterval(id);
  }, [global.liveUpdates, sel, signal.data, run, cfg.refresh.liveSignalMs]);

  useKiteConnected(() => { if (sel && sel.quotable !== false && (signal.isError || signal.data)) void run(); });

  // Best-effort India VIX (advisory) for the timing estimate. Never fabricated.
  useEffect(() => {
    if (!signal.data) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.kite.quote(cfg.defaults.vixQuoteSymbol);
        const first = res?.data ? (Object.values(res.data)[0] as { last_price?: number } | undefined) : undefined;
        const lp = first?.last_price;
        if (!cancelled) setVix(typeof lp === "number" && lp > 0 ? lp : null);
      } catch {
        if (!cancelled) setVix(null);
      }
    };
    void load();
    const id = window.setInterval(load, cfg.refresh.vixMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [signal.data, cfg.defaults.vixQuoteSymbol, cfg.refresh.vixMs]);

  useEffect(() => {
    if (!signal.data) return;
    const timers = [0, 120, 320].map((ms) => window.setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [signal.data]);

  const refreshCache = useCallback(async () => {
    try { await api.kite.instrumentsRefresh(); } catch { /* analyze() surfaces issues */ }
    void analyze();
  }, [analyze]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
      {/* Compact instrument header */}
      <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", padding: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <InstrumentSearch onSelect={onSelect} autoFocus={false} segment={segment === "all" ? undefined : segment} placeholder="Search instrument…" />
          </div>
          <InstrumentTypeSelector value={segment} onChange={setSegment} />
        </div>
        {sel && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <span style={{ minWidth: 0, flex: "1 1 auto", display: "inline-flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel.displayName}</span>
              <span className="num" style={{ fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{sel.instrument}{sel.lotSize ? ` · lot ${sel.lotSize}` : ""}</span>
              {!sel.quotable && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--action-avoid)", border: "1px solid var(--action-avoid-border)", borderRadius: 3, padding: "0 4px" }}>reference</span>}
            </span>
            <ThemedSelect value={interval} onChange={setInterval} ariaLabel="Timeframe" className="w-24" options={INTERVALS.map((i) => ({ value: i, label: i }))} />
            <ThemedSelect value={riskProfile} onChange={setRiskProfile} ariaLabel="Strategy mode" className="w-36" options={STRATEGY_MODES.map((m) => ({ value: m.value, label: m.label }))} />
            <button type="button" onClick={() => void analyze()} disabled={signal.isLoading || referenceOnly} title="Lock a fresh trade plan"
              style={{ height: 32, padding: "0 14px", borderRadius: "var(--radius-md)", border: "none", background: "var(--brand-500)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: signal.isLoading || referenceOnly ? "not-allowed" : "pointer", opacity: signal.isLoading || referenceOnly ? 0.5 : 1, whiteSpace: "nowrap" }}>
              {signal.isLoading ? "Analysing…" : plan ? "Re-analyse" : "Analyse"}
            </button>
            <button type="button" onClick={() => global.setSelectedInstrument(null)} title="Clear selection" aria-label="Clear" style={{ width: 30, height: 30, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-3)", cursor: "pointer" }}><Icon n="x" size={14} /></button>
          </div>
        )}
      </div>

      {!sel ? (
        <EmptyState title="Select an instrument to analyse" message="Search above — equity, index, future or option. Nothing is selected by default." />
      ) : referenceOnly ? (
        <ReferenceCard sel={sel} resolving={resolving} note={resolveNote} onMap={() => void chooseNearestTradable()} onRefresh={() => void refreshCache()} onClear={() => global.setSelectedInstrument(null)} />
      ) : signal.isIdle ? (
        <EmptyState title={`Ready: ${sel.displayName}`} message="Analyse for a live read-only decision. Needs Kite enabled & authorised." />
      ) : signal.isLoading && !signal.data ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Fetching live data and computing the signal…</p>
      ) : signal.isError ? (
        <InstrumentError name={sel.displayName} message={signal.error} onRetry={() => void analyze()} onRefresh={() => void refreshCache()} onClear={() => global.setSelectedInstrument(null)} />
      ) : signal.data ? (
        <>
          {/* OHLC — compact inline stats (reorderable, saved) */}
          <OhlcStrip signal={signal.data} chart={chart} />

          {/* Compact monitoring status — session, last tick/candle/VIX/news, MFE/MAE */}
          {mon.session && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 10.5, color: "var(--ink-3)", padding: "3px 4px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, color: mon.active ? "var(--action-enter)" : "var(--action-wait)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: mon.active ? "var(--action-enter)" : "var(--action-wait)" }} />
                Monitoring {mon.active ? "live" : "paused"}
              </span>
              <span>· tick <span className="num">{fmtMarketTime(mon.lastTickMs, tz) ?? "—"}</span></span>
              <span>· candle <span className="num">{fmtMarketTime(mon.lastCandleMs, tz, false) ?? "—"}</span></span>
              <span className="hide-sm">· VIX <span className="num">{fmtMarketTime(mon.lastVixMs, tz, false) ?? "n/a"}</span></span>
              <span className="hide-sm">· news <span className="num">{fmtMarketTime(mon.lastNewsMs, tz, false) ?? "n/a"}</span></span>
              {mon.mfe != null && <span className="hide-sm">· MFE <span className="num" style={{ color: "var(--price-up)" }}>+{mon.mfe}</span> / MAE <span className="num" style={{ color: "var(--price-down)" }}>-{mon.mae}</span></span>}
            </div>
          )}

          {/* THE one primary decision strip */}
          <DecisionStrip d={dec.d} plan={plan} evalResult={evalResult} refreshedAt={dec.refreshedAt} live={global.liveUpdates} onReanalyse={() => void analyze()} monitor={monitorSummary} />

          {/* Chart — appears high; locked levels; native indicators */}
          <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <span className="eyebrow">Chart · locked levels</span>
              <div style={{ position: "relative" }}>
                <button type="button" onClick={() => setIndicatorsOpen((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-2)", background: "var(--surface-sunken)", color: "var(--ink-2)", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                  <Icon n="activity" size={13} /> Indicators ({indicators.filter((i) => i.enabled).length})
                </button>
                {indicatorsOpen && <IndicatorsPanel indicators={indicators} setIndicators={setIndicators} onClose={() => setIndicatorsOpen(false)} />}
              </div>
            </div>
            {chart && chart.candles.length > 0 ? (
              <>
                <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-1)", background: "var(--surface-sunken)", padding: 6 }}>
                  <LiveChart data={chart} priceLines={plan ? planPriceLines(plan) : priceLinesFor(signal.data)} indicators={indicators} theme={theme} />
                </div>
                <div style={{ marginTop: 8 }}><OscillatorCards candles={chart.candles} indicators={indicators} /></div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", padding: "16px 0" }}>Chart needs Kite candles — none returned for this view yet.</p>
            )}
          </div>

          {/* Secondary evidence — tabbed; only the active tab renders */}
          <EvidenceTabs d={dec.d} plan={plan} evalResult={evalResult} signal={signal.data} vix={vix} onReanalyse={() => void analyze()} />
        </>
      ) : null}

      <AlertToasts toasts={alerts.toasts} onDismiss={alerts.dismiss} />
    </div>
  );
}

/** Friendly error/unavailable state for a selected instrument (e.g. GIFT/NSEIX). */
function InstrumentError({ name, message, onRetry, onRefresh, onClear }: { name: string; message: string | null; onRetry: () => void; onRefresh: () => void; onClear: () => void }) {
  const friendly = !!message && /(not found|resolve|unsupported|invalid|no candle|instrument|unavailable|cache|nseix|gift)/i.test(message);
  return (
    <div className="rounded-xl border border-neutralSignal/30 bg-neutralSignal-soft p-4">
      <p className="text-sm font-bold text-neutralSignal">{friendly ? `${name} is currently unavailable in Kite data` : "Couldn't compute the signal"}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {friendly ? "It may not be quotable via Kite (e.g. GIFT / NSEIX), or the instruments cache is stale. Refresh the cache, or clear and pick another instrument." : "Enable & authorise Kite (top bar), then retry. The live signal needs live Kite data."}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/5">Retry</button>
        <button type="button" onClick={onRefresh} className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20">Refresh cache</button>
        <button type="button" onClick={onClear} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-bear">Clear</button>
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
        <strong className="text-slate-200">{sel.displayName}</strong> is visible but not directly quoteable via Kite{ex ? ` (exchange ${ex})` : ""}. Choose a nearest tradable instrument for live analysis.
      </p>
      {note && <p className="mt-1.5 text-xs font-medium text-bear">{note}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={onMap} disabled={resolving} className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-50">{resolving ? "Finding nearest future…" : "Choose nearest tradable"}</button>
        <button type="button" onClick={onRefresh} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/5">Refresh cache</button>
        <button type="button" onClick={onClear} className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-bear">Clear</button>
      </div>
    </div>
  );
}

function underlyingFor(sel: SharedInstrument): string {
  const key = sel.instrument.toUpperCase();
  const n = (sel.name || sel.displayName || "").toUpperCase();
  if (key.includes("GIFT") || n.includes("GIFT") || n.includes("SGX")) return "NIFTY";
  const cleaned = n.replace(/\(INDEX\)/g, "").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "NIFTY";
}

const LINE = { entry: "#5b82ee", sl: "#f04438", target: "#12b76a" } as const;

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

function planPriceLines(p: TradePlanSnapshot): { price: number; color: string; title: string }[] {
  const lines: { price: number; color: string; title: string }[] = [];
  if (p.entry != null) lines.push({ price: p.entry, color: LINE.entry, title: "Entry" });
  if (p.stopLoss != null) lines.push({ price: p.stopLoss, color: LINE.sl, title: "SL" });
  if (p.targets[0] != null) lines.push({ price: p.targets[0], color: LINE.target, title: "T1" });
  if (p.targets[1] != null) lines.push({ price: p.targets[1], color: LINE.target, title: "T2" });
  return lines;
}
