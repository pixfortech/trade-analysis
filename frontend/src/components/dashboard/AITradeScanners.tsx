"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { useAiScanners, type Scanner } from "@/lib/aiScanners";
import { useAiVirtualTrades } from "@/lib/aiVirtualTrades";
import { buildTimeBasedPlan } from "@/lib/timeBasedPlan";
import {
  deriveEntryScanner,
  derivePositionManager,
  computeRiskLevel,
  type ActivePosition,
  type AssistantTone,
  type AssistantView,
  type RiskLevel,
} from "@/lib/tradeAssistant";
import type { LiveSignal } from "@/types/api";

const TONE: Record<AssistantTone, { chip: string; dot: string; text: string }> = {
  bull: { chip: "border-bull/40 bg-bull-soft text-bull", dot: "bg-bull", text: "text-bull" },
  bear: { chip: "border-bear/40 bg-bear-soft text-bear", dot: "bg-bear", text: "text-bear" },
  warn: { chip: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal", dot: "bg-neutralSignal", text: "text-neutralSignal" },
  info: { chip: "border-accent/40 bg-accent/10 text-accent", dot: "bg-accent", text: "text-accent" },
  neutral: { chip: "border-white/10 bg-base-800 text-slate-300", dot: "bg-slate-500", text: "text-slate-300" },
};
const RISK_CLS: Record<RiskLevel, string> = {
  Low: "border-bull/40 bg-bull-soft text-bull",
  Medium: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  High: "border-bear/40 bg-bear-soft text-bear",
  Extreme: "border-bear/60 bg-bear/20 text-bear",
};

interface ChipSummary { tone: AssistantTone; label: string; risk: RiskLevel | null }

/**
 * AI Trade Scanners dock (Phase 3N). Hosts multiple independent scanners opened
 * from the Watchlist. Each can be expanded (full live analysis) or minimised to
 * a chip. Read-only/advisory. Lives in the grid so it reflows with the dashboard.
 */
export function AITradeScanners() {
  const { scanners, minimise, expand, togglePin, close, closeAllUnpinned } = useAiScanners();
  const g = useGlobalControls();
  const [cmps, setCmps] = useState<Record<string, number | null>>({});
  const [summaries, setSummaries] = useState<Record<string, ChipSummary>>({});

  const keys = useMemo(() => scanners.map((s) => s.instrument.instrument), [scanners]);
  const keysJoined = keys.join(",");

  // Batch-quote all open scanners for chip CMP (one request).
  useEffect(() => {
    if (keys.length === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.kite.quotes(keys);
        if (cancelled) return;
        setCmps((cur) => {
          const next = { ...cur };
          for (const [k, q] of Object.entries(res.data)) next[k] = typeof q.last_price === "number" ? q.last_price : null;
          return next;
        });
      } catch {
        /* keep last known */
      }
    };
    void load();
    if (!g.liveUpdates) return () => { cancelled = true; };
    const id = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [keysJoined, g.liveUpdates, keys]);

  const reportSummary = useCallback((id: string, s: ChipSummary) => {
    setSummaries((cur) => (cur[id] && cur[id].label === s.label && cur[id].risk === s.risk ? cur : { ...cur, [id]: s }));
  }, []);

  const ordered = useMemo(() => [...scanners].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt), [scanners]);
  const expanded = ordered.filter((s) => s.state === "expanded");

  return (
    <Card
      id="ai-scanners"
      title="AI Trade Scanners"
      subtitle="Open independent scanners from the Watchlist · read-only"
      action={
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-base-800 px-2.5 py-1 text-[11px] font-medium text-slate-400">{scanners.length} open</span>
          {scanners.length > 0 && (
            <button type="button" onClick={closeAllUnpinned} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200">Close unpinned</button>
          )}
        </div>
      }
    >
      {scanners.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-white/10 bg-base-800/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-300">No scanners open</p>
          <p className="mt-1 max-w-sm text-xs text-slate-500">Click <span className="font-semibold text-slate-300">Analyse</span> on any instrument in the Watchlist to open a fresh AI Trade Scanner here. You can keep several open at once and minimise each to a chip.</p>
        </div>
      ) : (
        <>
          {/* Chip rail — every scanner, minimised or expanded */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ordered.map((s) => {
              const sum = summaries[s.id];
              const tone = sum ? TONE[sum.tone] : TONE.neutral;
              const cmp = cmps[s.instrument.instrument] ?? null;
              const isExp = s.state === "expanded";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (isExp ? minimise(s.id) : expand(s.id))}
                  title={isExp ? "Minimise" : "Expand"}
                  className={`group inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${isExp ? `${tone.chip}` : "border-white/10 bg-base-800/60 text-slate-300 hover:bg-white/5"}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  <span className="text-[11px] font-semibold">{s.instrument.displayName}</span>
                  <span className="num text-[11px] opacity-80">{cmp == null ? "" : num(cmp)}</span>
                  {sum && <span className="text-[10px] font-semibold uppercase opacity-90">{sum.label}</span>}
                  {s.pinned && <span className="text-[10px]" title="Pinned">📌</span>}
                  <span role="button" tabIndex={-1} aria-label={`Close ${s.instrument.displayName}`} onClick={(e) => { e.stopPropagation(); close(s.id); }} className="ml-0.5 text-slate-500 hover:text-bear">✕</span>
                </button>
              );
            })}
          </div>

          {/* Expanded scanners */}
          {expanded.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-base-800/40 px-3 py-3 text-center text-xs text-slate-500">All scanners minimised — tap a chip above to expand.</p>
          ) : (
            <div className="space-y-3">
              {expanded.map((s) => (
                <ScannerCard key={s.id} scanner={s} cmpHint={cmps[s.instrument.instrument] ?? null} onMinimise={() => minimise(s.id)} onClose={() => close(s.id)} onTogglePin={() => togglePin(s.id)} onSummary={reportSummary} />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// =============================== scanner card ===============================

function vtToPos(t: { side: "LONG" | "SHORT"; entryPrice: number; quantity: number; stopLoss: number | null; target: number | null; id: string }): ActivePosition {
  return { source: "ai-virtual", side: t.side, entryPrice: t.entryPrice, quantity: t.quantity, stopLoss: t.stopLoss, target: t.target, id: t.id };
}

function ScannerCard({
  scanner,
  cmpHint,
  onMinimise,
  onClose,
  onTogglePin,
  onSummary,
}: {
  scanner: Scanner;
  cmpHint: number | null;
  onMinimise: () => void;
  onClose: () => void;
  onTogglePin: () => void;
  onSummary: (id: string, s: ChipSummary) => void;
}) {
  const g = useGlobalControls();
  const vt = useAiVirtualTrades();
  const key = scanner.instrument.instrument;
  const [data, setData] = useState<LiveSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);

  const fetchSignal = useCallback(async () => {
    try {
      const res = await api.liveSignal({ instrument: key, interval: "5minute", riskProfile: "balanced" });
      setData(res);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach the backend.");
    }
  }, [key]);

  useEffect(() => {
    void fetchSignal();
    if (!g.liveUpdates) return;
    const id = window.setInterval(() => void fetchSignal(), 6000);
    return () => window.clearInterval(id);
  }, [key, g.liveUpdates, fetchSignal]);

  const openVts = vt.openForInstrument(key);
  const managed = openVts[0] ? vtToPos(openVts[0]) : null;
  const view: AssistantView | null = data ? (managed ? derivePositionManager(data, managed) : deriveEntryScanner(data)) : null;

  // Report a compact summary up to the dock for the chip.
  useEffect(() => {
    if (view) onSummary(scanner.id, { tone: view.tone, label: view.label, risk: view.riskLevel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.state, view?.tone, view?.riskLevel, scanner.id]);

  const t = view ? TONE[view.tone] : TONE.neutral;
  const cmp = data?.currentPrice ?? cmpHint;
  const itype = data?.resolvedInstrument.instrumentType ?? "";
  const bull = data?.probability.bullishPercent ?? null;
  const bear = data?.probability.bearishPercent ?? null;

  return (
    <div className={`rounded-xl border bg-base-800/30 ${view ? t.chip.split(" ")[0] : "border-white/10"}`}>
      {/* header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${t.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-100">{scanner.instrument.displayName}</p>
          <p className="num truncate text-[10px] text-slate-500">{scanner.instrument.exchange}{itype ? ` · ${itype}` : ""} · {updatedAt ? `updated ${secsAgo(updatedAt)}` : g.liveUpdates ? "loading…" : "live off"}</p>
        </div>
        <div className="text-right">
          <p className="num text-sm font-bold text-slate-100">{cmp == null ? "—" : num(cmp)}</p>
          <p className="text-[9px] uppercase text-slate-500">CMP</p>
        </div>
        <button type="button" onClick={onTogglePin} title={scanner.pinned ? "Unpin" : "Pin"} className={`grid h-6 w-6 place-items-center rounded ${scanner.pinned ? "text-accent" : "text-slate-500 hover:text-slate-300"}`}>📌</button>
        <button type="button" onClick={onMinimise} title="Minimise" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-slate-300">▁</button>
        <button type="button" onClick={onClose} title="Close" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-bear">✕</button>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        {!view ? (
          error ? (
            <p className="rounded-lg border border-bear/30 bg-bear-soft px-3 py-2 text-xs text-bear">Unavailable — {error}</p>
          ) : (
            <p className="text-xs text-slate-500">Reading live data…</p>
          )
        ) : (
          <>
            {/* action + mode */}
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-bold uppercase tracking-wide ${t.chip}`}>{view.label}</span>
              <span className="rounded-md border border-white/15 bg-base-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">{view.mode === "POSITION_MANAGER" ? `Managing · ${managed?.source === "zerodha" ? "Zerodha" : "Virtual"}` : "Entry Scanner"}</span>
            </div>

            {/* bullish / bearish bar */}
            {bull != null && bear != null && (
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-bull">Bullish {bull}%</span>
                  <span className="font-semibold text-bear">{bear}% Bearish</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-base-700">
                  <div className="bg-bull" style={{ width: `${bull}%` }} />
                  <div className="bg-bear" style={{ width: `${bear}%` }} />
                </div>
              </div>
            )}

            {/* risk / confidence / rr */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <Pill label="Risk" value={view.riskLevel ?? "—"} cls={view.riskLevel ? RISK_CLS[view.riskLevel] : "border-white/10 text-slate-400"} />
              <Pill label="Confidence" value={view.confidencePercent == null ? "—" : `${view.confidencePercent}%`} cls="border-white/10 text-slate-200" sub="estimated" />
              <Pill label="R:R" value={view.riskReward ?? "—"} cls="border-white/10 text-slate-200" />
            </div>

            {/* levels */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <Lvl label="Entry" value={view.levels.entry} />
              <Lvl label="Stop-loss" value={view.levels.stopLoss} tone="bear" />
              <Lvl label="Target 1" value={view.levels.target1} tone="bull" />
            </div>

            {/* action line + P/L */}
            <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${t.chip}`}>{view.action}</p>
            {view.pnl && <p className={`text-center text-xs font-bold ${view.pnl.total >= 0 ? "text-bull" : "text-bear"}`}>Live P/L {view.pnl.total >= 0 ? "+" : ""}₹{num(view.pnl.total)} ({view.pnl.percent >= 0 ? "+" : ""}{num(view.pnl.percent)}%)</p>}

            {/* reason factors */}
            {view.factors.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {view.factors.slice(0, 3).map((f, i) => (
                  <span key={i} className={`rounded-full border px-2 py-0.5 text-[10px] ${f.dir === "bullish" ? "border-bull/30 bg-bull-soft text-bull" : f.dir === "bearish" ? "border-bear/30 bg-bear-soft text-bear" : "border-white/10 bg-base-800 text-slate-400"}`}>{f.text}</span>
                ))}
              </div>
            )}
            <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-slate-100">Why: </span>{view.reason}</p>

            {/* position / add virtual */}
            {!managed && data && (
              <button
                type="button"
                onClick={() => addVirtualFromSignal(vt, data)}
                className="w-full rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
              >
                + Add AI Virtual Trade from this setup
              </button>
            )}

            {/* collapsible detail */}
            {data && (
              <>
                <Collapsible title="Time plan"><TimePlan signal={data} /></Collapsible>
                <Collapsible title="Indicators"><Indicators signal={data} /></Collapsible>
                <Collapsible title="Calculation basis (bullish/bearish)"><Basis signal={data} /></Collapsible>
              </>
            )}
            <p className="text-[10px] leading-relaxed text-slate-500">Estimated probabilities from live indicator alignment — advisory only, not guaranteed. {data?.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  );
}

function addVirtualFromSignal(vt: ReturnType<typeof useAiVirtualTrades>, s: LiveSignal) {
  const long = s.preferredSetup !== "short" && s.finalDecision.action !== "SHORT";
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = (long ? setup.entryAbove : setup.entryBelow) ?? s.currentPrice;
  vt.add({
    instrumentKey: s.resolvedInstrument.instrumentKey,
    displayName: s.resolvedInstrument.displayName || s.instrument,
    exchange: s.resolvedInstrument.exchange,
    instrumentToken: s.resolvedInstrument.instrumentToken,
    side: long ? "LONG" : "SHORT",
    entryPrice: Math.round(entry * 100) / 100,
    lotSize: s.resolvedInstrument.lotSize > 0 ? s.resolvedInstrument.lotSize : 1,
    lots: 1,
    stopLoss: setup.stopLoss,
    target: setup.target1,
    notes: "From AI scanner setup",
  });
}

function Pill({ label, value, cls, sub }: { label: string; value: string; cls: string; sub?: string }) {
  return (
    <div className={`rounded-md border px-1.5 py-1 ${cls}`}>
      <p className="text-[9px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xs font-bold">{value}</p>
      {sub && <p className="text-[8px] opacity-60">{sub}</p>}
    </div>
  );
}

function Lvl({ label, value, tone }: { label: string; value: number | null; tone?: "bull" | "bear" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-100";
  return (
    <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1">
      <p className="text-[9px] uppercase text-slate-500">{label}</p>
      <p className={`num text-xs font-bold ${value == null ? "text-slate-500" : c}`}>{value == null ? "—" : `₹${num(value)}`}</p>
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/40">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-300">
        {title}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="px-3 pb-2.5">{children}</div>}
    </div>
  );
}

function TimePlan({ signal }: { signal: LiveSignal }) {
  const plan = buildTimeBasedPlan(signal);
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-slate-500">Best style: <span className="font-semibold text-slate-200">{plan.bestStyle}</span> · {plan.recommendedAction}</p>
      {plan.rows.map((r) => (
        <div key={r.period} className="rounded border border-white/10 bg-base-800/50 px-2 py-1.5">
          <p className="text-[11px] font-bold text-slate-100">{r.period}</p>
          <p className="text-[10px] leading-snug text-slate-400">{r.plan}</p>
          <p className="text-[10px] leading-snug text-slate-500">Exit: {r.exitCondition}</p>
        </div>
      ))}
    </div>
  );
}

function Indicators({ signal }: { signal: LiveSignal }) {
  const i = signal.indicators;
  const cells: [string, string][] = [
    ["VWAP", signal.marketData.vwap == null ? "—" : num(signal.marketData.vwap)],
    ["EMA20", i.ema20 == null ? "—" : num(i.ema20)],
    ["EMA50", i.ema50 == null ? "—" : num(i.ema50)],
    ["RSI", i.rsi == null ? "—" : num(i.rsi)],
    ["MACD", i.macd == null ? "—" : num(i.macd.histogram)],
    ["ADX", i.adx == null ? "—" : num(i.adx.adx)],
    ["ATR", i.atr == null ? "—" : num(i.atr)],
    ["Supertrend", i.supertrend == null ? "—" : i.supertrend.direction],
    ["Volume", i.volumeConfirmed == null ? "—" : i.volumeConfirmed ? "Confirmed" : "Low"],
    ["OI", i.oi == null ? "—" : num(i.oi)],
  ];
  return (
    <div className="grid grid-cols-3 gap-1">
      {cells.map(([k, v]) => (
        <div key={k} className="rounded border border-white/10 bg-base-800/60 px-1.5 py-1">
          <p className="text-[8px] uppercase text-slate-500">{k}</p>
          <p className="num text-[11px] font-semibold text-slate-100">{v}</p>
        </div>
      ))}
    </div>
  );
}

function Basis({ signal }: { signal: LiveSignal }) {
  const rows = signal.indicatorContributions.slice().sort((a, b) => b.weight - a.weight);
  if (rows.length === 0) return <p className="text-[10px] text-slate-500">Indicator breakdown unavailable.</p>;
  return (
    <div className="space-y-1">
      {rows.map((c, i) => (
        <p key={i} className={`flex items-center justify-between rounded border px-2 py-1 text-[10px] ${c.direction === "bullish" ? "border-bull/30 bg-bull-soft text-bull" : c.direction === "bearish" ? "border-bear/30 bg-bear-soft text-bear" : "border-white/10 bg-base-800 text-slate-400"}`}>
          <span className="font-semibold">{c.id} · {c.value}</span>
          <span className="opacity-70">{c.direction} · w{c.weight}</span>
        </p>
      ))}
    </div>
  );
}

function secsAgo(then: number): string {
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  return s < 1 ? "now" : `${s}s ago`;
}
