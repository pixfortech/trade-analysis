"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { useAiScanners, type Scanner } from "@/lib/aiScanners";
import { useAiVirtualTrades, type NewVirtualTrade } from "@/lib/aiVirtualTrades";
import { buildTimeBasedPlan } from "@/lib/timeBasedPlan";
import {
  deriveEntryScanner,
  derivePositionManager,
  computeRiskLevel,
  factorBreakdown,
  type ActivePosition,
  type AssistantTone,
  type AssistantView,
  type RiskLevel,
} from "@/lib/tradeAssistant";
import type { LiveSignal } from "@/types/api";

const TONE: Record<AssistantTone, { chip: string; dot: string; text: string; border: string }> = {
  bull: { chip: "border-bull/40 bg-bull-soft text-bull", dot: "bg-bull", text: "text-bull", border: "border-bull/40" },
  bear: { chip: "border-bear/40 bg-bear-soft text-bear", dot: "bg-bear", text: "text-bear", border: "border-bear/40" },
  warn: { chip: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal", dot: "bg-neutralSignal", text: "text-neutralSignal", border: "border-neutralSignal/40" },
  info: { chip: "border-accent/40 bg-accent/10 text-accent", dot: "bg-accent", text: "text-accent", border: "border-accent/40" },
  neutral: { chip: "border-white/10 bg-base-800 text-slate-300", dot: "bg-slate-500", text: "text-slate-300", border: "border-white/10" },
};
const RISK_CLS: Record<RiskLevel, string> = {
  Low: "border-bull/40 bg-bull-soft text-bull",
  Medium: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  High: "border-bear/40 bg-bear-soft text-bear",
  Extreme: "border-bear/60 bg-bear/20 text-bear",
};

interface ChipSummary { tone: AssistantTone; label: string; risk: RiskLevel | null }
type TabId = "summary" | "time" | "risk" | "details";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function useIsMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

function vtToPos(t: { side: "LONG" | "SHORT"; entryPrice: number; quantity: number; stopLoss: number | null; target: number | null; id: string }): ActivePosition {
  return { source: "ai-virtual", side: t.side, entryPrice: t.entryPrice, quantity: t.quantity, stopLoss: t.stopLoss, target: t.target, id: t.id };
}

/**
 * Floating AI Trade Assistants (Phase 3O). Renders MULTIPLE independent
 * assistant windows opened from the Watchlist. Each runs its own live analysis,
 * is draggable (desktop) / a bottom sheet (mobile), and can be minimised to a
 * chip in the dock. Read-only/advisory — never places orders.
 */
export function FloatingAssistants() {
  const { scanners, focus, minimise, close, closeAllUnpinned, togglePin, bringToFront, setPosition, focusNonce, focusedId } = useAiScanners();
  const g = useGlobalControls();
  const isMobile = useIsMobile();
  const [cmps, setCmps] = useState<Record<string, number | null>>({});
  const [summaries, setSummaries] = useState<Record<string, ChipSummary>>({});
  const [breadth, setBreadth] = useState<{ up: number; down: number } | null>(null);

  const keys = useMemo(() => scanners.map((s) => s.instrument.instrument), [scanners]);
  const keysJoined = keys.join(",");

  // Batch quote all open assistants for chip CMP (one request).
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

  // Market breadth (indices) for the Sentiment tab — best effort, slow refresh.
  const hasScanners = scanners.length > 0;
  useEffect(() => {
    if (!hasScanners) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.topMovers("indices");
        if (!cancelled) setBreadth({ up: r.gainers.length, down: r.losers.length });
      } catch {
        if (!cancelled) setBreadth(null);
      }
    };
    void load();
    const id = window.setInterval(load, 90_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [hasScanners]);

  const reportSummary = useCallback((id: string, s: ChipSummary) => {
    setSummaries((cur) => (cur[id] && cur[id].label === s.label && cur[id].risk === s.risk ? cur : { ...cur, [id]: s }));
  }, []);

  if (scanners.length === 0) return null;

  const expanded = scanners.filter((s) => s.state === "expanded");
  const frontId = expanded.length ? expanded.reduce((a, b) => (a.zIndex >= b.zIndex ? a : b)).id : null;
  // On mobile only the front window shows (as a bottom sheet); the rest dock.
  const windows = isMobile ? expanded.filter((s) => s.id === frontId) : expanded;
  const dockItems = (isMobile ? scanners.filter((s) => s.id !== frontId) : scanners.filter((s) => s.state === "minimised")).sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      {windows.map((s) => (
        <AssistantWindow
          key={s.id}
          scanner={s}
          isMobile={isMobile}
          isFront={s.id === frontId}
          breadth={breadth}
          pulseNonce={focusedId === s.id ? focusNonce : 0}
          cmpHint={cmps[s.instrument.instrument] ?? null}
          onMinimise={() => minimise(s.id)}
          onClose={() => close(s.id)}
          onTogglePin={() => togglePin(s.id)}
          onFront={() => bringToFront(s.id)}
          onMove={(x, y) => setPosition(s.id, x, y)}
          onSummary={reportSummary}
        />
      ))}

      {dockItems.length > 0 && (
        <div
          style={{ zIndex: 90 }}
          className={isMobile ? "fixed inset-x-2 top-2 flex gap-1.5 overflow-x-auto" : "fixed bottom-4 left-4 flex max-w-[230px] flex-col items-start gap-1.5"}
        >
          {!isMobile && dockItems.some((s) => !s.pinned) && (
            <button type="button" onClick={closeAllUnpinned} className="rounded-md border border-white/10 bg-base-900/90 px-2 py-1 text-[10px] text-slate-400 shadow-card backdrop-blur hover:text-slate-200">
              Close unpinned
            </button>
          )}
          {dockItems.map((s) => {
            const sum = summaries[s.id];
            const tone = sum ? TONE[sum.tone] : TONE.neutral;
            const cmp = cmps[s.instrument.instrument] ?? null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => focus(s.id)}
                title={`Open ${s.instrument.displayName}`}
                className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-base-900/95 px-2.5 py-1.5 shadow-card backdrop-blur ${tone.border}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                <span className="text-[11px] font-semibold text-slate-100">{s.instrument.displayName}</span>
                <span className="num text-[11px] text-slate-400">{cmp == null ? "" : num(cmp)}</span>
                {sum && <span className={`text-[10px] font-semibold uppercase ${tone.text}`}>{sum.label}</span>}
                {s.pinned && <span className="text-[10px]">📌</span>}
                <span role="button" tabIndex={-1} aria-label={`Close ${s.instrument.displayName}`} onClick={(e) => { e.stopPropagation(); close(s.id); }} className="text-slate-500 hover:text-bear">✕</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// =============================== window ===============================

function AssistantWindow({
  scanner,
  isMobile,
  isFront,
  breadth,
  pulseNonce,
  cmpHint,
  onMinimise,
  onClose,
  onTogglePin,
  onFront,
  onMove,
  onSummary,
}: {
  scanner: Scanner;
  isMobile: boolean;
  isFront: boolean;
  breadth: { up: number; down: number } | null;
  pulseNonce: number;
  cmpHint: number | null;
  onMinimise: () => void;
  onClose: () => void;
  onTogglePin: () => void;
  onFront: () => void;
  onMove: (x: number, y: number) => void;
  onSummary: (id: string, s: ChipSummary) => void;
}) {
  const g = useGlobalControls();
  const vt = useAiVirtualTrades();
  const key = scanner.instrument.instrument;
  const [data, setData] = useState<LiveSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [tab, setTab] = useState<TabId>("summary");
  const [pos, setPos] = useState(scanner.position);
  const [pulse, setPulse] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;

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
    const id = window.setInterval(() => void fetchSignal(), 5000);
    return () => window.clearInterval(id);
  }, [key, g.liveUpdates, fetchSignal]);

  // Pulse the border briefly when focused.
  useEffect(() => {
    if (!pulseNonce) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 2200);
    return () => window.clearTimeout(t);
  }, [pulseNonce]);

  const openVts = vt.openForInstrument(key);
  const managed = openVts[0] ? vtToPos(openVts[0]) : null;
  const view: AssistantView | null = data ? (managed ? derivePositionManager(data, managed) : deriveEntryScanner(data)) : null;

  useEffect(() => {
    if (view) onSummary(scanner.id, { tone: view.tone, label: view.label, risk: view.riskLevel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.state, view?.tone, view?.riskLevel, scanner.id]);

  // Drag (desktop only) — stable per-drag handlers so listeners always detach.
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return;
    if ((e.target as HTMLElement).closest("button")) return;
    onFront();
    const base = { ...posRef.current };
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => {
      setPos({ x: clamp(base.x + ev.clientX - sx, 0, window.innerWidth - 80), y: clamp(base.y + ev.clientY - sy, 0, window.innerHeight - 60) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onMove(posRef.current.x, posRef.current.y);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  const t = view ? TONE[view.tone] : TONE.neutral;
  const cmp = data?.currentPrice ?? cmpHint;
  const itype = data?.resolvedInstrument.instrumentType ?? "";
  const ringCls = pulse ? "border-accent ring-2 ring-accent/60 shadow-[0_0_0_4px_rgba(59,130,246,0.18)]" : `${t.border}`;

  const frameStyle: React.CSSProperties = isMobile
    ? { zIndex: scanner.zIndex }
    : { zIndex: scanner.zIndex, left: pos.x, top: pos.y, width: 384 };
  const frameCls = isMobile
    ? "fixed inset-x-2 bottom-2 flex max-h-[82vh] flex-col"
    : "fixed flex max-h-[78vh] flex-col";

  return (
    <div style={frameStyle} className={`${frameCls} overflow-hidden rounded-2xl border ${ringCls} bg-base-900/95 shadow-card backdrop-blur transition-shadow`} onMouseDown={() => { if (!isFront) onFront(); }}>
      {/* header (drag handle on desktop) */}
      <div onPointerDown={onHeaderPointerDown} className={`flex items-center gap-2 border-b border-white/10 px-3 py-2 ${isMobile ? "" : "cursor-move"}`}>
        <span className={`h-2 w-2 rounded-full ${t.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-100">{scanner.instrument.displayName}</p>
          <p className="num truncate text-[10px] text-slate-500">
            {scanner.instrument.exchange}{itype ? ` · ${itype}` : ""} · {updatedAt ? `updated ${secsAgo(updatedAt)}` : g.liveUpdates ? "loading…" : "live off"}
          </p>
        </div>
        {view && <span className="rounded-md border border-white/15 bg-base-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300">{view.mode === "POSITION_MANAGER" ? `Managing · ${managed?.source === "zerodha" ? "Zerodha" : "Virtual"}` : "Scanner"}</span>}
        <button type="button" onClick={onTogglePin} title={scanner.pinned ? "Unpin" : "Pin"} className={`grid h-6 w-6 place-items-center rounded ${scanner.pinned ? "text-accent" : "text-slate-500 hover:text-slate-300"}`}>📌</button>
        <button type="button" onClick={onMinimise} title="Minimise" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-slate-300">▁</button>
        <button type="button" onClick={onClose} title="Close" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-bear">✕</button>
      </div>

      {/* top summary */}
      {view && (
        <div className="border-b border-white/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-bold uppercase tracking-wide ${t.chip}`}>{view.label}</span>
            <div className="text-right">
              <p className="num text-xl font-bold text-slate-100">{cmp == null ? "—" : num(cmp)}</p>
              <p className="text-[9px] uppercase text-slate-500">CMP</p>
            </div>
          </div>
          {data && data.probability && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-bull">Bullish {data.probability.bullishPercent}%</span>
                <span className="font-semibold text-bear">{data.probability.bearishPercent}% Bearish</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-base-700">
                <div className="bg-bull" style={{ width: `${data.probability.bullishPercent}%` }} />
                <div className="bg-bear" style={{ width: `${data.probability.bearishPercent}%` }} />
              </div>
            </div>
          )}
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <Pill label="Risk" value={view.riskLevel ?? "—"} cls={view.riskLevel ? RISK_CLS[view.riskLevel] : "border-white/10 text-slate-400"} />
            <Pill label="Confidence" value={view.confidencePercent == null ? "—" : `${view.confidencePercent}%`} cls="border-white/10 text-slate-200" sub="estimated" />
            <Pill label="R:R" value={view.riskReward ?? "—"} cls="border-white/10 text-slate-200" />
          </div>
        </div>
      )}

      {/* tabs */}
      {view && (
        <div className="flex shrink-0 gap-1 border-b border-white/10 px-2 py-1.5">
          {(["summary", "time", "risk", "details"] as TabId[]).map((id) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 rounded-md px-1 py-1 text-[11px] font-semibold capitalize ${tab === id ? "bg-accent/15 text-accent" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
              {id === "time" ? "Time" : id}
            </button>
          ))}
        </div>
      )}

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!view ? (
          error ? (
            <p className="rounded-lg border border-bear/30 bg-bear-soft px-3 py-2 text-xs text-bear">Unavailable — {error}</p>
          ) : (
            <p className="text-xs text-slate-500">Reading live data…</p>
          )
        ) : (
          <>
            {tab === "summary" && <TabSummary view={view} data={data} managed={managed} vt={vt} />}
            {tab === "time" && data && <TabTime signal={data} />}
            {tab === "risk" && data && <TabRisk view={view} signal={data} breadth={breadth} />}
            {tab === "details" && data && <TabDetails signal={data} view={view} />}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 px-3 py-1.5 text-center text-[10px] text-slate-500">Read-only advisory · No orders placed</div>
    </div>
  );
}

// =============================== tabs ===============================

function TabSummary({ view, data, managed, vt }: { view: AssistantView; data: LiveSignal | null; managed: ActivePosition | null; vt: ReturnType<typeof useAiVirtualTrades> }) {
  const t = TONE[view.tone];
  return (
    <div className="space-y-2.5">
      <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${t.chip}`}>{view.action}</p>
      {view.pnl && <p className={`text-center text-xs font-bold ${view.pnl.total >= 0 ? "text-bull" : "text-bear"}`}>Live P/L {view.pnl.total >= 0 ? "+" : ""}₹{num(view.pnl.total)} ({view.pnl.percent >= 0 ? "+" : ""}{num(view.pnl.percent)}%)</p>}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Lvl label="Entry" value={view.levels.entry} />
        <Lvl label="Stop-loss" value={view.levels.stopLoss} tone="bear" />
        <Lvl label="Target 1" value={view.levels.target1} tone="bull" />
        <Lvl label="Target 2" value={view.levels.target2} tone="bull" />
        <Lvl label="Target 3" value={view.levels.target3} tone="bull" />
        <Lvl label="Trail" value={view.levels.trail} tone="warn" />
      </div>
      {view.factors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {view.factors.slice(0, 3).map((f, i) => (
            <span key={i} className={`rounded-full border px-2 py-0.5 text-[10px] ${f.dir === "bullish" ? "border-bull/30 bg-bull-soft text-bull" : f.dir === "bearish" ? "border-bear/30 bg-bear-soft text-bear" : "border-white/10 bg-base-800 text-slate-400"}`}>{f.text}</span>
          ))}
        </div>
      )}
      <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-slate-100">Why: </span>{view.reason}</p>
      {!managed && data && (
        <button type="button" onClick={() => vt.add(virtualFromSignal(data))} className="w-full rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20">+ Add AI Virtual Trade from this setup</button>
      )}
      {managed && <p className="text-[10px] text-slate-500">Managing a {managed.source === "zerodha" ? "Zerodha" : "virtual"} position — guidance above reflects your entry ₹{num(managed.entryPrice)}.</p>}
    </div>
  );
}

function TabTime({ signal }: { signal: LiveSignal }) {
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

function TabRisk({ view, signal, breadth }: { view: AssistantView; signal: LiveSignal; breadth: { up: number; down: number } | null }) {
  const [open, setOpen] = useState(false);
  const atrPct = signal.indicators.atr != null && signal.currentPrice ? Math.round((signal.indicators.atr / signal.currentPrice) * 10000) / 100 : null;
  const breakdown = factorBreakdown(signal);
  const bt = breadth ? (breadth.up > breadth.down ? "text-bull" : breadth.down > breadth.up ? "text-bear" : "text-slate-300") : "text-slate-400";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <FactorCard label="Volatility" value={atrPct == null ? "—" : `ATR ${atrPct}%`} />
        <FactorCard label="Trend" value={`${cap(signal.trend.direction)} (${signal.trend.strength})`} />
        <FactorCard label="Data" value={signal.probability.dataQuality} />
      </div>
      <div className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2">
        <p className="text-[10px] uppercase text-slate-500">Market breadth (NSE indices)</p>
        <p className={`text-sm font-bold ${bt}`}>{breadth ? `${breadth.up} up / ${breadth.down} down` : "unavailable (needs live Kite)"}</p>
        <p className="text-[10px] text-slate-500">News sentiment: unavailable</p>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">Confidence is an <span className="font-semibold text-slate-200">estimated probability</span> ({view.confidencePercent == null ? "—" : `${view.confidencePercent}%`}) from indicator alignment — never guaranteed.</p>
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-accent">{open ? "Hide" : "Show"} calculation basis</button>
      {open && (
        <div className="space-y-1">
          {breakdown.map((b, i) => (
            <p key={i} className={`rounded border px-2 py-1 text-[10px] leading-snug ${b.dir === "bullish" ? "border-bull/30 bg-bull-soft text-bull" : b.dir === "bearish" ? "border-bear/30 bg-bear-soft text-bear" : "border-white/10 bg-base-800 text-slate-400"}`}>{b.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function TabDetails({ signal, view }: { signal: LiveSignal; view: AssistantView }) {
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
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1">
        {cells.map(([k, v]) => (
          <div key={k} className="rounded border border-white/10 bg-base-800/60 px-1.5 py-1">
            <p className="text-[8px] uppercase text-slate-500">{k}</p>
            <p className="num text-[11px] font-semibold text-slate-100">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500">Data quality: {signal.probability.dataQuality} · updated {new Date(signal.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
      <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-slate-100">Reason: </span>{view.reason}</p>
      <p className="rounded-lg border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[10px] leading-relaxed text-neutralSignal">⚠️ {signal.disclaimer}</p>
    </div>
  );
}

// =============================== helpers ===============================

function virtualFromSignal(s: LiveSignal): NewVirtualTrade {
  const long = s.preferredSetup !== "short" && s.finalDecision.action !== "SHORT";
  const setup = long ? s.longSetup : s.shortSetup;
  const entry = (long ? setup.entryAbove : setup.entryBelow) ?? s.currentPrice;
  return {
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
    notes: "From floating assistant setup",
  };
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

function Lvl({ label, value, tone }: { label: string; value: number | null; tone?: "bull" | "bear" | "warn" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-neutralSignal" : "text-slate-100";
  return (
    <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1">
      <p className="text-[9px] uppercase text-slate-500">{label}</p>
      <p className={`num text-xs font-bold ${value == null ? "text-slate-500" : c}`}>{value == null ? "—" : `₹${num(value)}`}</p>
    </div>
  );
}

function FactorCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-base-800/60 px-2 py-2">
      <p className="text-[9px] uppercase text-slate-500">{label}</p>
      <p className="text-[11px] font-semibold capitalize text-slate-100">{value}</p>
    </div>
  );
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}
function secsAgo(then: number): string {
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  return s < 1 ? "now" : `${s}s ago`;
}
