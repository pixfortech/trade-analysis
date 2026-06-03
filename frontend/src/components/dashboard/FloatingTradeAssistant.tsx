"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertToasts } from "./AlertToasts";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { useAiWatchlist, MAX_WATCH, type WatchScrip } from "@/lib/aiWatchlist";
import { useAiVirtualTrades, type AiVirtualTrade, type VtSide } from "@/lib/aiVirtualTrades";
import { buildTimeBasedPlan } from "@/lib/timeBasedPlan";
import {
  deriveEntryScanner,
  derivePositionManager,
  parseZerodhaPosition,
  noSelectionView,
  offlineView,
  loadingView,
  staleView,
  computeRiskLevel,
  factorBreakdown,
  type ActivePosition,
  type AssistantTone,
  type AssistantView,
  type RiskLevel,
} from "@/lib/tradeAssistant";
import type { LiveSignal, SignalAction } from "@/types/api";

const POLL_MS = 4000; // active scrip full signal (3–5s while global live ON)
const QUOTES_MS = 5000; // chip LTP batch
const RR_MS = 6000; // round-robin per-chip signal refresh
const POS_MS = 30_000; // Zerodha positions poll
const STALE_MS = 20_000;
const SOUND_COOLDOWN_MS = 15_000;
const OPEN_KEY = "trade-ui.assistant.open.v1";
const PINNED_KEY = "trade-ui.assistant.pinned.v1";
const MUTED_KEY = "trade-ui.assistant.muted.v1";

type TabId = "entry" | "position" | "time" | "risk" | "sentiment" | "details";
const TABS: { id: TabId; label: string }[] = [
  { id: "entry", label: "Entry Plan" },
  { id: "position", label: "Position" },
  { id: "time", label: "Time Plan" },
  { id: "risk", label: "Risk" },
  { id: "sentiment", label: "Sentiment" },
  { id: "details", label: "Details" },
];

const TONE: Record<AssistantTone, { chip: string; ring: string; dot: string; text: string }> = {
  bull: { chip: "border-bull/40 bg-bull-soft text-bull", ring: "border-bull/40", dot: "bg-bull", text: "text-bull" },
  bear: { chip: "border-bear/40 bg-bear-soft text-bear", ring: "border-bear/40", dot: "bg-bear", text: "text-bear" },
  warn: { chip: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal", ring: "border-neutralSignal/40", dot: "bg-neutralSignal", text: "text-neutralSignal" },
  info: { chip: "border-accent/40 bg-accent/10 text-accent", ring: "border-accent/40", dot: "bg-accent", text: "text-accent" },
  neutral: { chip: "border-white/10 bg-base-800 text-slate-300", ring: "border-white/10", dot: "bg-slate-500", text: "text-slate-300" },
};

const RISK_CLS: Record<RiskLevel, string> = {
  Low: "border-bull/40 bg-bull-soft text-bull",
  Medium: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  High: "border-bear/40 bg-bear-soft text-bear",
  Extreme: "border-bear/60 bg-bear/20 text-bear",
};

const ACTION_TONE: Record<SignalAction, AssistantTone> = { LONG: "bull", SHORT: "bear", WAIT: "neutral", AVOID: "warn" };

interface ChipSummary {
  ltp: number | null;
  changePercent: number | null;
  action: SignalAction | null;
  confidence: string | null;
  risk: RiskLevel | null;
  updatedAt: number | null;
}

function vtToPosition(t: AiVirtualTrade): ActivePosition {
  return { source: "ai-virtual", side: t.side, entryPrice: t.entryPrice, quantity: t.quantity, stopLoss: t.stopLoss, target: t.target, id: t.id };
}

/**
 * Floating AI Trade Assistant (Phase 3M). Tracks multiple scrips, and for the
 * ACTIVE scrip operates as an Entry Scanner (no position) or Position Manager
 * (real Zerodha position or AI Virtual Trade). Detailed analysis is organised
 * into tabs to stay visually simple. Read-only/advisory — never places orders.
 */
export function FloatingTradeAssistant() {
  const g = useGlobalControls();
  const alerts = useAlerts();
  const watch = useAiWatchlist();
  const vt = useAiVirtualTrades();

  const active = g.selectedInstrument;
  const activeKey = active?.instrument || null;

  // Detailed signal for the active scrip.
  const [data, setData] = useState<LiveSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOkAt, setLastOkAt] = useState(0);
  const [summaries, setSummaries] = useState<Record<string, ChipSummary>>({});
  const [movers, setMovers] = useState<{ up: number; down: number } | null>(null);
  const [rawPositions, setRawPositions] = useState<unknown>(null);
  const [now, setNow] = useState(() => Date.now());

  // UI state
  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [muted, setMuted] = useState(true);
  const [tab, setTab] = useState<TabId>("entry");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const lastSound = useRef(0);

  // The full chip list = watchlist ∪ active (active always shown).
  const chips: WatchScrip[] = useMemo(() => {
    const list = [...watch.list];
    if (active && !list.some((s) => s.instrument === active.instrument)) {
      list.unshift({ instrument: active.instrument, displayName: active.displayName, lotSize: active.lotSize });
    }
    return list.slice(0, MAX_WATCH + 1);
  }, [watch.list, active]);
  const chipKeys = useMemo(() => chips.map((c) => c.instrument), [chips]);
  const chipKeysJoined = chipKeys.join(",");

  // ---- hydrate UI prefs ----
  useEffect(() => {
    try {
      const o = window.localStorage.getItem(OPEN_KEY);
      if (o != null) setOpen(o === "true");
      setPinned(window.localStorage.getItem(PINNED_KEY) === "true");
      const m = window.localStorage.getItem(MUTED_KEY);
      if (m != null) setMuted(m === "true");
    } catch {
      /* ignore */
    }
  }, []);
  const persist = (key: string, v: boolean) => {
    try {
      window.localStorage.setItem(key, String(v));
    } catch {
      /* ignore */
    }
  };

  const mergeSummary = useCallback((key: string, patch: Partial<ChipSummary>) => {
    setSummaries((cur) => ({ ...cur, [key]: { ...(cur[key] ?? { ltp: null, changePercent: null, action: null, confidence: null, risk: null, updatedAt: null }), ...patch } }));
  }, []);

  // ---- active scrip full signal ----
  const fetchActive = useCallback(async () => {
    if (!activeKey) return;
    try {
      const res = await api.liveSignal({ instrument: activeKey, interval: "5minute", riskProfile: "balanced" });
      setData(res);
      setError(null);
      setLastOkAt(Date.now());
      mergeSummary(activeKey, {
        ltp: res.currentPrice,
        action: res.finalDecision.action,
        confidence: res.probability.confidence,
        risk: computeRiskLevel(res),
        updatedAt: Date.now(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach the backend.");
    }
  }, [activeKey, mergeSummary]);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [activeKey]);

  useEffect(() => {
    if (!activeKey) return;
    void fetchActive();
    if (!g.liveUpdates) return;
    const id = window.setInterval(() => void fetchActive(), POLL_MS);
    return () => window.clearInterval(id);
  }, [activeKey, g.liveUpdates, fetchActive]);

  // ---- chip LTP batch ----
  useEffect(() => {
    if (chipKeys.length === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.kite.quotes(chipKeys);
        if (cancelled) return;
        for (const [key, q] of Object.entries(res.data)) {
          const ltp = typeof q.last_price === "number" ? q.last_price : null;
          const close = q.ohlc?.close;
          const changePercent = ltp != null && close ? Math.round(((ltp - close) / close) * 10000) / 100 : null;
          mergeSummary(key, { ltp, changePercent });
        }
      } catch {
        /* keep last known */
      }
    };
    void load();
    if (!g.liveUpdates) return () => { cancelled = true; };
    const id = window.setInterval(load, QUOTES_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [chipKeysJoined, g.liveUpdates, chipKeys, mergeSummary]);

  // ---- round-robin per-chip signal (action/confidence/risk for non-active) ----
  const rrIndex = useRef(0);
  useEffect(() => {
    if (!g.liveUpdates) return;
    const others = chipKeys.filter((k) => k !== activeKey);
    if (others.length === 0) return;
    const tick = async () => {
      const key = others[rrIndex.current % others.length];
      rrIndex.current += 1;
      try {
        const res = await api.liveSignal({ instrument: key, interval: "5minute", riskProfile: "balanced" });
        mergeSummary(key, { ltp: res.currentPrice, action: res.finalDecision.action, confidence: res.probability.confidence, risk: computeRiskLevel(res), updatedAt: Date.now() });
      } catch {
        /* ignore one chip's failure */
      }
    };
    const id = window.setInterval(tick, RR_MS);
    return () => window.clearInterval(id);
  }, [chipKeysJoined, activeKey, g.liveUpdates, chipKeys, mergeSummary]);

  // ---- market breadth (indices) ----
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.topMovers("indices");
        if (!cancelled) setMovers({ up: r.gainers.length, down: r.losers.length });
      } catch {
        if (!cancelled) setMovers(null);
      }
    };
    void load();
    const id = window.setInterval(load, 90_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // ---- Zerodha positions (best-effort, for real-position detection) ----
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.account.positions();
        if (!cancelled) setRawPositions(r);
      } catch {
        if (!cancelled) setRawPositions(null);
      }
    };
    void load();
    const id = window.setInterval(load, POS_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // ---- tick for staleness / "updated Ns ago" ----
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ---- resolve active position(s) for the active scrip ----
  const openVts = useMemo(() => (activeKey ? vt.openForInstrument(activeKey) : []), [vt, activeKey]);
  const realPos = useMemo(() => (activeKey ? parseZerodhaPosition(rawPositions, activeKey) : null), [rawPositions, activeKey]);
  const candidates = useMemo(() => {
    const list: { id: string; label: string; pos: ActivePosition; vtId?: string }[] = openVts.map((t) => ({
      id: t.id,
      label: `Virtual ${t.side} ${t.lots}×${t.lotSize} @ ₹${num(t.entryPrice)}`,
      pos: vtToPosition(t),
      vtId: t.id,
    }));
    if (realPos) list.push({ id: "zerodha", label: `Zerodha ${realPos.side} ${realPos.quantity} @ ₹${num(realPos.entryPrice)}`, pos: realPos });
    return list;
  }, [openVts, realPos]);

  const managed = useMemo(() => {
    if (candidates.length === 0) return null;
    return candidates.find((c) => c.id === selectedPositionId) ?? candidates[0];
  }, [candidates, selectedPositionId]);

  // ---- build the view ----
  const stale = !!data && g.liveUpdates && now - lastOkAt > STALE_MS;
  let view: AssistantView;
  if (!activeKey) view = noSelectionView();
  else if (error && !data) view = offlineView(error);
  else if (data) {
    const baseView = managed ? derivePositionManager(data, managed.pos) : deriveEntryScanner(data);
    view = stale ? staleView(baseView) : baseView;
  } else view = loadingView();
  const connecting = !!error && !!data;

  // Auto-switch to the Position tab the first time a position appears.
  const prevMode = useRef(view.mode);
  useEffect(() => {
    if (prevMode.current !== "POSITION_MANAGER" && view.mode === "POSITION_MANAGER") setTab("position");
    if (prevMode.current === "POSITION_MANAGER" && view.mode === "ENTRY_SCANNER" && tab === "position") setTab("entry");
    prevMode.current = view.mode;
  }, [view.mode, tab]);

  // ---- alerts (mode-correct; cooldown via useAlerts per key) ----
  const viewRef = useRef(view);
  viewRef.current = view;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(() => {
    const v = viewRef.current;
    if (!v.alert || !data || !g.alertsEnabled) return;
    const name = data.resolvedInstrument.displayName || data.instrument;
    const key = `assist-${v.mode}-${v.state}-${data.resolvedInstrument.instrumentKey}-${managed?.id ?? "none"}`;
    alerts.push(key, `${name}: ${v.label}`, v.alert.message, v.alert.severity);
    if (v.alert.sound && !mutedRef.current) beep(v.state === "EXIT_NOW" ? 440 : v.state === "ENTER_NOW" ? 660 : 550, v.state === "EXIT_NOW", lastSound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state, view.mode, data?.resolvedInstrument.instrumentKey, managed?.id, g.alertsEnabled]);

  const t = TONE[view.tone];
  const cmp = data?.currentPrice ?? null;

  const onAddScrip = (ins: SelectedInstrument) => {
    watch.add({ instrument: ins.instrument, displayName: ins.displayName, lotSize: ins.lotSize, exchange: ins.exchange, instrumentType: ins.instrumentType });
    g.setSelectedInstrument({ instrument: ins.instrument, displayName: ins.displayName, lotSize: ins.lotSize });
    setAddOpen(false);
  };

  return (
    <div className="fixed inset-x-2 bottom-2 z-40 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[420px]">
      {open ? (
        <div className={`flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border ${t.ring} bg-base-900/95 shadow-card backdrop-blur`}>
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="relative flex h-2.5 w-2.5">
              {g.liveUpdates && !connecting && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${t.dot} opacity-60`} />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${t.dot}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-100">AI Trade Assistant</p>
              <p className="truncate text-[11px] text-slate-500">
                {connecting ? "reconnecting…" : g.liveUpdates ? `live · updated ${secsAgo(now, lastOkAt)}` : "live off"}
              </p>
            </div>
            <ModeBadge mode={view.mode} source={managed?.pos.source ?? null} />
            <button type="button" onClick={() => setMuted((v) => (persist(MUTED_KEY, !v), !v))} title={muted ? "Sound off" : "Sound on"} aria-label="Toggle sound" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-200">
              {muted ? "🔇" : "🔔"}
            </button>
            <button type="button" onClick={() => setPinned((v) => (persist(PINNED_KEY, !v), !v))} title={pinned ? "Unpin" : "Pin open"} aria-label="Toggle pin" className={`grid h-7 w-7 place-items-center rounded-md hover:bg-white/10 ${pinned ? "text-accent" : "text-slate-400 hover:text-slate-200"}`}>
              📌
            </button>
            <button type="button" onClick={() => setOpen((v) => (persist(OPEN_KEY, !v), !v))} title="Collapse" aria-label="Collapse" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          {/* Scrip chips */}
          <div className="border-b border-white/10 px-2 py-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {chips.map((c) => {
                const sum = summaries[c.instrument];
                const isActive = c.instrument === activeKey;
                const aTone = sum?.action ? TONE[ACTION_TONE[sum.action]] : TONE.neutral;
                return (
                  <button
                    key={c.instrument}
                    type="button"
                    onClick={() => g.setSelectedInstrument({ instrument: c.instrument, displayName: c.displayName, lotSize: c.lotSize })}
                    className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-left ${isActive ? `${aTone.ring} bg-white/5` : "border-white/10 hover:bg-white/5"}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${aTone.dot}`} />
                    <span className="text-[11px] font-semibold text-slate-200">{c.displayName}</span>
                    <span className="num text-[11px] text-slate-400">{sum?.ltp != null ? num(sum.ltp) : "…"}</span>
                    {sum?.changePercent != null && (
                      <span className={`text-[10px] ${sum.changePercent >= 0 ? "text-bull" : "text-bear"}`}>{sum.changePercent >= 0 ? "+" : ""}{sum.changePercent}%</span>
                    )}
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Remove ${c.displayName}`}
                      onClick={(e) => { e.stopPropagation(); watch.remove(c.instrument); }}
                      className="ml-0.5 hidden text-slate-500 hover:text-bear group-hover:inline"
                    >
                      ✕
                    </span>
                  </button>
                );
              })}
              <button type="button" onClick={() => setAddOpen((v) => !v)} disabled={watch.full} title={watch.full ? `Max ${MAX_WATCH} scrips` : "Add scrip"} className="shrink-0 rounded-lg border border-dashed border-white/20 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-40">
                + Add
              </button>
            </div>
            {addOpen && (
              <div className="mt-2">
                <InstrumentSearch onSelect={onAddScrip} placeholder="Add Equity / Index / Future / Option…" />
                <p className="mt-1 text-[10px] text-slate-500">Source: Live Kite Instrument · separate from Paper Trade watchlist.</p>
              </div>
            )}
          </div>

          {/* Summary row */}
          <div className="border-b border-white/10 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-bold uppercase tracking-wide ${t.chip}`}>{view.label}</span>
                {view.direction !== "NONE" && <span className="ml-2 text-[11px] font-semibold uppercase text-slate-500">{view.direction}</span>}
              </div>
              <div className="text-right">
                <p className="num text-2xl font-bold text-slate-100">{cmp == null ? "—" : num(cmp)}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">CMP · {active?.displayName}</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center sm:grid-cols-6">
              <Mini label="Entry" value={view.levels.entry} />
              <Mini label="SL" value={view.levels.stopLoss} tone="bear" />
              <Mini label="Target" value={view.levels.target1} tone="bull" />
              <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1">
                <p className="text-[9px] uppercase text-slate-500">Conf.</p>
                <p className={`text-xs font-bold ${confColor(view.confidenceLabel)}`}>{view.confidencePercent == null ? "—" : `${view.confidencePercent}%`}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1">
                <p className="text-[9px] uppercase text-slate-500">Risk</p>
                <p className={`text-xs font-bold ${view.riskLevel ? RISK_CLS[view.riskLevel].split(" ").pop() : "text-slate-400"}`}>{view.riskLevel ?? "—"}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1">
                <p className="text-[9px] uppercase text-slate-500">R:R</p>
                <p className="text-xs font-bold text-slate-200">{view.riskReward ?? "—"}</p>
              </div>
            </div>
            <p className={`mt-2 rounded-lg border px-3 py-2 text-sm font-semibold ${t.chip}`}>{view.action}</p>
            {view.pnl && (
              <p className={`mt-1.5 text-center text-sm font-bold ${view.pnl.total >= 0 ? "text-bull" : "text-bear"}`}>
                Live P/L {view.pnl.total >= 0 ? "+" : ""}₹{num(view.pnl.total)} ({view.pnl.percent >= 0 ? "+" : ""}{num(view.pnl.percent)}%)
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5">
            {TABS.map((tb) => (
              <button key={tb.id} type="button" onClick={() => setTab(tb.id)} className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold ${tab === tb.id ? "bg-accent/15 text-accent" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
                {tb.label}
                {tb.id === "position" && candidates.length > 0 && <span className="ml-1 rounded-full bg-accent/30 px-1 text-[9px]">{candidates.length}</span>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {tab === "entry" && <EntryPlanTab view={view} />}
            {tab === "position" && (
              <PositionTab
                view={view}
                signal={data}
                cmp={cmp}
                candidates={candidates}
                managedId={managed?.id ?? null}
                onSelectPosition={setSelectedPositionId}
                active={active}
                vt={vt}
                hasRealPos={!!realPos}
              />
            )}
            {tab === "time" && <TimePlanTab signal={data} />}
            {tab === "risk" && <RiskTab view={view} signal={data} />}
            {tab === "sentiment" && <SentimentTab signal={data} movers={movers} />}
            {tab === "details" && <DetailsTab signal={data} view={view} />}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-3 py-1.5 text-[10px] text-slate-500">
            <span>Advisory · read-only · no orders</span>
            <button type="button" onClick={() => void fetchActive()} className="rounded border border-white/10 px-2 py-0.5 text-slate-400 hover:text-slate-200">Refresh</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen((v) => (persist(OPEN_KEY, !v), !v))} className={`flex w-full items-center gap-2 rounded-full border ${t.ring} bg-base-900/95 px-3 py-2 text-left shadow-card backdrop-blur`}>
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {g.liveUpdates && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${t.dot} opacity-60`} />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${t.dot}`} />
          </span>
          <span className={`text-xs font-bold uppercase tracking-wide ${t.text}`}>{view.label}</span>
          <span className="truncate text-[11px] text-slate-400">{active?.displayName} · {view.mode === "POSITION_MANAGER" ? "managing" : "scanning"}</span>
          <span className="num ml-auto text-sm font-semibold text-slate-100">{cmp == null ? "" : num(cmp)}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-slate-400"><path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}

      <AlertToasts toasts={alerts.toasts} onDismiss={alerts.dismiss} />
    </div>
  );
}

// ============================ sub-components ================================

function ModeBadge({ mode, source }: { mode: AssistantView["mode"]; source: ActivePosition["source"] | null }) {
  if (mode === "POSITION_MANAGER") {
    return (
      <span className="rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent" title={source === "zerodha" ? "Source: Zerodha position" : "Source: AI virtual trade"}>
        Managing · {source === "zerodha" ? "Zerodha" : "Virtual"}
      </span>
    );
  }
  return <span className="rounded-md border border-white/15 bg-base-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">Entry Scanner</span>;
}

function Mini({ label, value, tone }: { label: string; value: number | null; tone?: "bull" | "bear" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-200";
  return (
    <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1">
      <p className="text-[9px] uppercase text-slate-500">{label}</p>
      <p className={`num text-xs font-bold ${value == null ? "text-slate-500" : c}`}>{value == null ? "—" : num(value)}</p>
    </div>
  );
}

function Row({ label, value, tone, hint, prefix = "₹" }: { label: string; value: number | string | null; tone?: AssistantTone; hint?: string; prefix?: string }) {
  const t = tone ? TONE[tone] : TONE.neutral;
  const display = value == null ? "—" : typeof value === "number" ? `${prefix}${num(value)}` : value;
  return (
    <div className={`rounded-lg border px-3 py-2 ${t.chip}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium opacity-90">{label}</span>
        <span className="num text-sm font-bold">{display}</span>
      </div>
      {hint && <p className="mt-0.5 text-[10px] leading-snug opacity-70">{hint}</p>}
    </div>
  );
}

function EntryPlanTab({ view }: { view: AssistantView }) {
  const long = view.direction === "LONG";
  const zone = view.levels.safeZoneLow != null && view.levels.safeZoneHigh != null ? `₹${num(view.levels.safeZoneLow)} – ₹${num(view.levels.safeZoneHigh)}` : null;
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-white/10 bg-base-800/50 px-3 py-2 text-xs text-slate-300">
        <span className="font-semibold text-slate-100">CMP vs entry: </span>{view.cmpStatus}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <Row label="Entry trigger" value={view.levels.entry} tone="info" hint={long ? "Enter only on a sustained break above." : view.direction === "SHORT" ? "Enter only on a sustained break below." : "Wait for a setup."} />
        <Row label="Safe entry zone" value={zone} tone="info" prefix="" hint="Enter inside this band — don't chase beyond it." />
        <Row label="Stop-loss" value={view.levels.stopLoss} tone="bear" hint="Setup is wrong if breached." />
        <Row label="Invalidation" value={view.levels.invalidation} tone="bear" hint="Decisive break = stand aside." />
        <Row label="Target 1" value={view.levels.target1} tone="bull" hint="Book partial / trail." />
        <Row label="Target 2" value={view.levels.target2} tone="bull" hint="Main objective." />
        <Row label="Target 3" value={view.levels.target3} tone="bull" hint="Stretch if trend strong." />
        <Row label="Trail stop (ATR)" value={view.levels.trail} tone="warn" hint="Ratchet only in your favour." />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Row label="Support" value={view.levels.support1} tone="bull" prefix="₹" hint="Watch for bounce / breakdown." />
        <Row label="Resistance" value={view.levels.resistance1} tone="bear" prefix="₹" hint="Watch for rejection / breakout." />
      </div>
      <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-xs leading-relaxed text-slate-300">
        <span className="font-semibold text-slate-100">Why: </span>{view.reason}
      </p>
      {view.riskFactor && (
        <p className="rounded-lg border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[11px] leading-relaxed text-neutralSignal">
          <span className="font-semibold">Risk: </span>{view.riskFactor}
        </p>
      )}
    </div>
  );
}

function PositionTab({
  view,
  signal,
  cmp,
  candidates,
  managedId,
  onSelectPosition,
  active,
  vt,
  hasRealPos,
}: {
  view: AssistantView;
  signal: LiveSignal | null;
  cmp: number | null;
  candidates: { id: string; label: string; pos: ActivePosition; vtId?: string }[];
  managedId: string | null;
  onSelectPosition: (id: string) => void;
  active: { instrument: string; displayName: string; lotSize: number | null } | null;
  vt: ReturnType<typeof useAiVirtualTrades>;
  hasRealPos: boolean;
}) {
  const managed = candidates.find((c) => c.id === managedId) ?? candidates[0] ?? null;
  const managedTrade = managed?.vtId ? vt.trades.find((t) => t.id === managed.vtId) ?? null : null;

  return (
    <div className="space-y-3">
      {candidates.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-base-800/50 px-3 py-2.5 text-xs text-slate-300">
          <p className="font-semibold text-slate-100">No active position detected.</p>
          <p className="mt-0.5 text-slate-400">{hasRealPos ? "" : "No Zerodha position matched this scrip. "}Add an AI Virtual Trade below if you hold it or took it in another account — the assistant will then manage it (hold / exit / book / trail).</p>
        </div>
      ) : (
        <>
          {candidates.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((c) => (
                <button key={c.id} type="button" onClick={() => onSelectPosition(c.id)} className={`rounded-md border px-2 py-1 text-[11px] ${c.id === (managed?.id ?? "") ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {managed && <ManagedPositionCard managed={managed} trade={managedTrade} cmp={cmp} view={view} vt={vt} />}
        </>
      )}

      <VirtualTradeForm active={active} cmp={cmp} signal={signal} onAdd={(input) => { vt.add(input); }} />

      {vt.trades.length > 0 && (
        <div className="text-right">
          <button type="button" onClick={() => { if (window.confirm("Reset ALL AI virtual trades? This does not touch Paper Trades.")) vt.reset(); }} className="text-[10px] text-slate-500 underline hover:text-bear">
            Reset AI virtual trades
          </button>
        </div>
      )}

      <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-300">AI Virtual Trade</span> tracks a real trade from another account or an AI-assisted virtual position with live action guidance. <span className="font-semibold text-slate-300">Paper Trade</span> (separate card) is for general practice. Advisory only — no real orders.
      </p>
    </div>
  );
}

function ManagedPositionCard({ managed, trade, cmp, view, vt }: { managed: { id: string; pos: ActivePosition; vtId?: string }; trade: AiVirtualTrade | null; cmp: number | null; view: AssistantView; vt: ReturnType<typeof useAiVirtualTrades> }) {
  const pos = managed.pos;
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState(pos.stopLoss != null ? String(pos.stopLoss) : "");
  const [tg, setTg] = useState(pos.target != null ? String(pos.target) : "");
  const long = pos.side === "LONG";
  const pnl = view.pnl;

  return (
    <div className={`rounded-xl border px-3 py-3 ${long ? "border-bull/30" : "border-bear/30"} bg-base-800/40`}>
      <div className="flex items-center justify-between">
        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${long ? "border-bull/40 bg-bull-soft text-bull" : "border-bear/40 bg-bear-soft text-bear"}`}>{pos.side}</span>
        <span className="text-[10px] text-slate-500">{pos.source === "zerodha" ? "Source: Zerodha live position" : "Source: AI virtual trade"}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Mini label="Entry" value={pos.entryPrice} />
        <Mini label="CMP" value={cmp} />
        <Mini label="Qty" value={pos.quantity} />
      </div>
      {pnl && (
        <p className={`mt-2 text-center text-sm font-bold ${pnl.total >= 0 ? "text-bull" : "text-bear"}`}>
          Live P/L {pnl.total >= 0 ? "+" : ""}₹{num(pnl.total)} ({pnl.perUnit >= 0 ? "+" : ""}{num(pnl.perUnit)}/unit · {pnl.percent >= 0 ? "+" : ""}{num(pnl.percent)}%)
        </p>
      )}
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <Mini label="Stop-loss" value={view.levels.stopLoss} tone="bear" />
        <Mini label="Target" value={view.levels.target1} tone="bull" />
        <Mini label="Trail" value={view.levels.trail} />
      </div>
      <p className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${TONE[view.tone].chip}`}>{view.action}</p>

      {trade && (
        <div className="mt-2">
          {editing ? (
            <div className="flex flex-wrap items-end gap-1.5">
              <label className="text-[10px] text-slate-500">SL<input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" className="mt-0.5 block w-20 rounded border border-white/10 bg-base-800 px-1.5 py-1 text-xs text-slate-100" /></label>
              <label className="text-[10px] text-slate-500">Target<input value={tg} onChange={(e) => setTg(e.target.value)} inputMode="decimal" className="mt-0.5 block w-20 rounded border border-white/10 bg-base-800 px-1.5 py-1 text-xs text-slate-100" /></label>
              <button type="button" onClick={() => { vt.edit(trade.id, { stopLoss: sl ? Number(sl) : null, target: tg ? Number(tg) : null }); setEditing(false); }} className="rounded bg-accent/20 px-2 py-1 text-[11px] font-semibold text-accent">Save</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-400">Cancel</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setEditing(true)} className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5">Edit SL/Target</button>
              <button type="button" onClick={() => vt.close(trade.id, cmp ?? trade.entryPrice)} className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5">Close @ CMP</button>
              <button type="button" onClick={() => { if (window.confirm("Delete this AI virtual trade?")) vt.remove(trade.id); }} className="rounded border border-bear/30 px-2 py-1 text-[11px] text-bear hover:bg-bear-soft">Delete</button>
            </div>
          )}
          {trade.notes && <p className="mt-1 text-[10px] text-slate-500">Note: {trade.notes}</p>}
        </div>
      )}
    </div>
  );
}

function VirtualTradeForm({ active, cmp, signal, onAdd }: { active: { instrument: string; displayName: string; lotSize: number | null } | null; cmp: number | null; signal: LiveSignal | null; onAdd: (input: import("@/lib/aiVirtualTrades").NewVirtualTrade) => void }) {
  const [show, setShow] = useState(false);
  const [side, setSide] = useState<VtSide>("LONG");
  const [entry, setEntry] = useState("");
  const [lots, setLots] = useState("1");
  const [sl, setSl] = useState("");
  const [tg, setTg] = useState("");
  const [notes, setNotes] = useState("");
  const lotSize = active?.lotSize ?? signal?.resolvedInstrument.lotSize ?? 1;

  if (!active) return null;
  const submit = () => {
    const e = Number(entry);
    if (!Number.isFinite(e) || e <= 0) return;
    onAdd({
      instrumentKey: active.instrument,
      displayName: active.displayName,
      exchange: signal?.resolvedInstrument.exchange ?? active.instrument.split(":")[0] ?? "",
      instrumentToken: signal?.resolvedInstrument.instrumentToken ?? null,
      side,
      entryPrice: e,
      lotSize: lotSize || 1,
      lots: Math.max(1, Math.round(Number(lots) || 1)),
      stopLoss: sl ? Number(sl) : null,
      target: tg ? Number(tg) : null,
      notes,
    });
    setShow(false);
    setEntry(""); setSl(""); setTg(""); setNotes(""); setLots("1");
  };

  return (
    <div className="rounded-lg border border-white/10 bg-base-800/40">
      <button type="button" onClick={() => setShow((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-200">
        <span>+ Add AI Virtual Trade</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 transition-transform ${show ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {show && (
        <div className="space-y-2 px-3 pb-3">
          <div className="flex gap-1.5">
            {(["LONG", "SHORT"] as VtSide[]).map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)} className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${side === s ? (s === "LONG" ? "border-bull/40 bg-bull-soft text-bull" : "border-bear/40 bg-bear-soft text-bear") : "border-white/10 text-slate-400"}`}>{s}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] text-slate-500">Entry price
              <div className="mt-0.5 flex gap-1">
                <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" placeholder="e.g. 14480" className="block w-full rounded border border-white/10 bg-base-800 px-1.5 py-1 text-xs text-slate-100" />
                <button type="button" onClick={() => cmp != null && setEntry(String(cmp))} className="shrink-0 rounded border border-white/10 px-1.5 text-[10px] text-slate-300 hover:bg-white/5" title="Use current CMP">CMP</button>
              </div>
            </label>
            <label className="text-[10px] text-slate-500">Lots (×{lotSize})<input value={lots} onChange={(e) => setLots(e.target.value)} inputMode="numeric" className="mt-0.5 block w-full rounded border border-white/10 bg-base-800 px-1.5 py-1 text-xs text-slate-100" /></label>
            <label className="text-[10px] text-slate-500">Stop-loss<input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" className="mt-0.5 block w-full rounded border border-white/10 bg-base-800 px-1.5 py-1 text-xs text-slate-100" /></label>
            <label className="text-[10px] text-slate-500">Target<input value={tg} onChange={(e) => setTg(e.target.value)} inputMode="decimal" className="mt-0.5 block w-full rounded border border-white/10 bg-base-800 px-1.5 py-1 text-xs text-slate-100" /></label>
          </div>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="block w-full rounded border border-white/10 bg-base-800 px-1.5 py-1 text-xs text-slate-100" />
          <p className="text-[10px] text-slate-500">Add a custom entry if you took it earlier / in another account.</p>
          <button type="button" onClick={submit} disabled={!entry} className="w-full rounded-md bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/30 disabled:opacity-40">Add virtual trade</button>
        </div>
      )}
    </div>
  );
}

function TimePlanTab({ signal }: { signal: LiveSignal | null }) {
  if (!signal) return <Unavailable text="Live signal needed for the time-based plan." />;
  const plan = buildTimeBasedPlan(signal);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2">
          <p className="text-[10px] uppercase text-slate-500">Best holding style now</p>
          <p className="text-sm font-bold capitalize text-slate-100">{plan.bestStyle}</p>
        </div>
        <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
          <p className="text-[10px] uppercase text-slate-500">Recommended</p>
          <p className="text-sm font-bold text-accent">{plan.recommendedAction}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {plan.rows.map((r) => (
          <div key={r.period} className="rounded-lg border border-white/10 bg-base-800/40 px-3 py-2">
            <p className="text-xs font-bold text-slate-100">{r.period}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-300"><span className="font-semibold text-slate-400">Plan: </span>{r.plan}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-300"><span className="font-semibold text-slate-400">Exit when: </span>{r.exitCondition}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-400"><span className="font-semibold">Trail: </span>{r.trailStop}</p>
            {r.riskNote && <p className="mt-0.5 text-[10px] text-neutralSignal">{r.riskNote}</p>}
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500">⚠️ Conditions to act on, not a fixed clock. Advisory only.</p>
    </div>
  );
}

function RiskTab({ view, signal }: { view: AssistantView; signal: LiveSignal | null }) {
  const [open, setOpen] = useState(false);
  if (!signal) return <Unavailable text="Live signal needed for risk scoring." />;
  const atrPct = signal.indicators.atr != null && signal.currentPrice ? Math.round((signal.indicators.atr / signal.currentPrice) * 10000) / 100 : null;
  const breakdown = factorBreakdown(signal);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        <div className={`rounded-lg border px-2 py-2 text-center ${view.riskLevel ? RISK_CLS[view.riskLevel] : "border-white/10 text-slate-400"}`}>
          <p className="text-[9px] uppercase opacity-80">Risk</p>
          <p className="text-sm font-bold">{view.riskLevel ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-base-800/60 px-2 py-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">Confidence</p>
          <p className={`text-sm font-bold ${confColor(view.confidenceLabel)}`}>{view.confidencePercent == null ? "—" : `${view.confidencePercent}%`}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-base-800/60 px-2 py-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">R:R</p>
          <p className="text-sm font-bold text-slate-200">{view.riskReward ?? "—"}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <FactorCard label="Volatility" value={atrPct == null ? "—" : `ATR ${atrPct}%`} />
        <FactorCard label="Trend" value={`${cap(signal.trend.direction)} (${signal.trend.strength})`} />
        <FactorCard label="Data" value={signal.probability.dataQuality} />
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400">Confidence is an <span className="font-semibold text-slate-200">estimated probability</span> from indicator alignment — never a guarantee of success.</p>
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-semibold text-accent">{open ? "Hide" : "Show"} factor breakdown</button>
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

function SentimentTab({ signal, movers }: { signal: LiveSignal | null; movers: { up: number; down: number } | null }) {
  const breadthTone = movers ? (movers.up > movers.down ? "text-bull" : movers.down > movers.up ? "text-bear" : "text-slate-300") : "text-slate-400";
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2">
        <p className="text-[10px] uppercase text-slate-500">Market breadth (NSE indices)</p>
        <p className={`text-sm font-bold ${breadthTone}`}>{movers ? `${movers.up} up / ${movers.down} down` : "unavailable (needs live Kite)"}</p>
        <p className="text-[10px] text-slate-500">Source: /api/market/top-movers · partial set</p>
      </div>
      {signal && (
        <div className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2">
          <p className="text-[10px] uppercase text-slate-500">This instrument</p>
          <p className="text-sm font-bold capitalize text-slate-100">{signal.trend.direction} · {signal.trend.strength}</p>
          <p className="text-[10px] text-slate-500">{signal.trend.reason}</p>
        </div>
      )}
      <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] text-slate-400">News sentiment: <span className="font-semibold text-slate-300">unavailable</span> — not implemented (no fabricated sentiment).</p>
    </div>
  );
}

function DetailsTab({ signal, view }: { signal: LiveSignal | null; view: AssistantView }) {
  if (!signal) return <Unavailable text="No live data yet." />;
  const i = signal.indicators;
  const cells: [string, string][] = [
    ["VWAP", signal.marketData.vwap == null ? "—" : num(signal.marketData.vwap)],
    ["EMA 20", i.ema20 == null ? "—" : num(i.ema20)],
    ["EMA 50", i.ema50 == null ? "—" : num(i.ema50)],
    ["RSI", i.rsi == null ? "—" : num(i.rsi)],
    ["MACD", i.macd == null ? "—" : num(i.macd.histogram)],
    ["ADX", i.adx == null ? "—" : num(i.adx.adx)],
    ["ATR", i.atr == null ? "—" : num(i.atr)],
    ["Supertrend", i.supertrend == null ? "—" : `${num(i.supertrend.value)} (${i.supertrend.direction})`],
    ["Volume", i.volumeConfirmed == null ? "—" : i.volumeConfirmed ? "Confirmed" : "Low"],
    ["OI", i.oi == null ? "—" : num(i.oi)],
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {cells.map(([k, v]) => (
          <div key={k} className="rounded-md border border-white/10 bg-base-800/60 px-2 py-1.5">
            <p className="text-[9px] uppercase text-slate-500">{k}</p>
            <p className="num text-xs font-semibold text-slate-100">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500">Data quality: {signal.probability.dataQuality} · updated {new Date(signal.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
      <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-300"><span className="font-semibold text-slate-100">Reason: </span>{view.reason}</p>
      <p className="rounded-lg border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[10px] leading-relaxed text-neutralSignal">⚠️ {signal.disclaimer}</p>
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

function Unavailable({ text }: { text: string }) {
  return <p className="rounded-lg border border-white/10 bg-base-800/50 px-3 py-3 text-xs text-slate-400">{text}</p>;
}

function confColor(label: "low" | "medium" | "high" | null): string {
  return label === "high" ? "text-bull" : label === "medium" ? "text-neutralSignal" : "text-slate-400";
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}

function secsAgo(now: number, then: number): string {
  if (!then) return "just now";
  const s = Math.max(0, Math.round((now - then) / 1000));
  return s < 1 ? "just now" : `${s}s ago`;
}

/** Short advisory beep + vibration (best-effort, cooldown-guarded). */
function beep(freq: number, urgent: boolean, last: { current: number }) {
  const now = Date.now();
  if (now - last.current < SOUND_COOLDOWN_MS) return;
  last.current = now;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(urgent ? [120, 60, 120] : 80);
  } catch {
    /* ignore */
  }
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ac.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.26);
    osc.onended = () => ac.close();
  } catch {
    /* ignore */
  }
}
