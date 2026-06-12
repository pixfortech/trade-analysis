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
  factorBreakdown,
  type ActivePosition,
  type AssistantView,
  type RiskLevel,
} from "@/lib/tradeAssistant";
import { MIN_SETUP_STRENGTH, MIN_WIN_ESTIMATE, confirmationChecks, setupStrength } from "@/lib/tradePlan";
import type { LiveSignal } from "@/types/api";

const RISK_CLS: Record<RiskLevel, string> = {
  Low: "border-bull/40 bg-bull-soft text-bull",
  Medium: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  High: "border-bear/40 bg-bear-soft text-bear",
  Extreme: "border-bear/60 bg-bear/20 text-bear",
};

// Unified action-state → colour mapping for the OUTER card border, glow, focus
// ring, header dot and action badge (kept harmonised, neutral card background).
// green = enter/long/hold-bull · blue = wait-for-breakout/pullback ·
// grey = no-setup/neutral · amber = avoid/caution · red = short/exit/reduce-risk.
type ActTone = "green" | "blue" | "grey" | "amber" | "red";
const ACT: Record<ActTone, { border: string; glow: string; ring: string; badge: string; dot: string; text: string }> = {
  green: { border: "border-bull/70", glow: "shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55),0_0_16px_-6px_rgba(22,199,132,0.55)]", ring: "ring-bull/60", badge: "border-bull/50 bg-bull-soft text-bull", dot: "bg-bull", text: "text-bull" },
  blue: { border: "border-accent/70", glow: "shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55),0_0_16px_-6px_rgba(59,130,246,0.55)]", ring: "ring-accent/60", badge: "border-accent/50 bg-accent/10 text-accent", dot: "bg-accent", text: "text-accent" },
  grey: { border: "border-slate-500/60", glow: "shadow-[0_10px_28px_-12px_rgba(0,0,0,0.5),0_0_14px_-6px_rgba(148,163,184,0.4)]", ring: "ring-slate-400/50", badge: "border-white/15 bg-base-800 text-slate-300", dot: "bg-slate-400", text: "text-slate-300" },
  amber: { border: "border-neutralSignal/70", glow: "shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55),0_0_16px_-6px_rgba(240,185,11,0.55)]", ring: "ring-neutralSignal/60", badge: "border-neutralSignal/50 bg-neutralSignal-soft text-neutralSignal", dot: "bg-neutralSignal", text: "text-neutralSignal" },
  red: { border: "border-bear/70", glow: "shadow-[0_10px_28px_-12px_rgba(0,0,0,0.55),0_0_16px_-6px_rgba(234,57,67,0.55)]", ring: "ring-bear/60", badge: "border-bear/50 bg-bear-soft text-bear", dot: "bg-bear", text: "text-bear" },
};

/** Map an assistant view to its single action tone (drives the outer styling). */
function actionTone(view: AssistantView): ActTone {
  const short = view.direction === "SHORT";
  switch (view.state) {
    case "ENTER_NOW":
    case "HOLD":
    case "TRAIL_SL":
    case "ADD_MORE_ONLY_IF_SAFE":
      return short ? "red" : "green";
    case "WAIT_FOR_BREAKOUT":
    case "WAIT_FOR_PULLBACK":
      return "blue";
    case "AVOID_TRADE":
    case "BOOK_PARTIAL":
    case "DATA_STALE":
      return "amber";
    case "EXIT_NOW":
    case "REDUCE_RISK":
      return "red";
    default:
      return "grey"; // WAIT_FOR_SETUP / LOADING / NO_SELECTION / BACKEND_OFFLINE
  }
}

type TabId = "summary" | "time" | "risk" | "details";
interface SignalState { data?: LiveSignal; error?: string; loading: boolean; updatedAt: number }

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

/** ENTER NOW gate: backend win estimate >=75% AND locked setup strength >=60%.
 *  The pill shows the backend win estimate (not a blended number). */
function gateConfidence(view: AssistantView, sig: LiveSignal): AssistantView {
  if (view.direction !== "LONG" && view.direction !== "SHORT") return view;
  const winEstimate = sig.probability.estimatedWinPercent;
  const strength = setupStrength(confirmationChecks(sig, view.direction));
  const v: AssistantView = { ...view, confidencePercent: winEstimate };
  if (view.state === "ENTER_NOW" && !(winEstimate >= MIN_WIN_ESTIMATE && strength >= MIN_SETUP_STRENGTH)) {
    const why = winEstimate < MIN_WIN_ESTIMATE ? `win est. ${winEstimate}% < ${MIN_WIN_ESTIMATE}%` : `only ${strength}% indicators confirm`;
    return { ...v, state: "WAIT_FOR_SETUP", label: "No approval — wait", tone: "warn", action: `No entry approval — ${why}. Re-analyse if structure changed.`, alert: null };
  }
  return v;
}

/**
 * Floating AI Trade Assistants (Phase 3P). Renders MULTIPLE independent
 * assistant windows opened from the Watchlist. Nothing opens by default — only
 * pinned windows restore on reload. Signals are fetched centrally so the action
 * shows immediately after opening and minimised chips stay in sync. Pinned
 * windows dock bottom-right; unpinned ones float (draggable). Read-only.
 */
export function FloatingAssistants() {
  const { scanners, focus, minimise, close, closeAllUnpinned, minimiseAll, togglePin, bringToFront, setPosition, popOut, focusNonce, focusedId } = useAiScanners();
  const g = useGlobalControls();
  const vt = useAiVirtualTrades();
  const isMobile = useIsMobile();
  const [signals, setSignals] = useState<Record<string, SignalState>>({});
  const [breadth, setBreadth] = useState<{ up: number; down: number } | null>(null);
  // LOCKED signal snapshot per instrument — the plan's entry/SL/targets come from
  // here and do NOT move with live ticks. Only Re-analyse re-locks. Live CMP is
  // overlaid from the latest poll; minimise/expand never recalculates levels.
  const [locked, setLocked] = useState<Record<string, LiveSignal>>({});

  const keys = useMemo(() => Array.from(new Set(scanners.map((s) => s.instrument.instrument))), [scanners]);
  const keysJoined = keys.join(",");
  const keysRef = useRef<string[]>([]);
  keysRef.current = keys;

  // Centralised live-signal fetch for EVERY open assistant (expanded or
  // minimised). Runs immediately when the set changes, then every 5s while live.
  const fetchAll = useCallback(async () => {
    const ks = keysRef.current;
    if (ks.length === 0) return;
    setSignals((cur) => {
      const n = { ...cur };
      for (const k of ks) if (!n[k]?.data) n[k] = { ...(n[k] ?? { updatedAt: 0 }), loading: true };
      return n;
    });
    await Promise.allSettled(
      ks.map(async (k) => {
        try {
          const d = await api.liveSignal({ instrument: k, interval: "5minute", riskProfile: "balanced" });
          setSignals((cur) => ({ ...cur, [k]: { data: d, error: undefined, loading: false, updatedAt: Date.now() } }));
        } catch (e) {
          setSignals((cur) => ({ ...cur, [k]: { ...(cur[k] ?? { updatedAt: 0 }), error: e instanceof Error ? e.message : "Request failed.", loading: false } }));
        }
      }),
    );
  }, []);

  useEffect(() => {
    if (keys.length === 0) return;
    void fetchAll();
    if (!g.liveUpdates) return;
    const id = window.setInterval(() => void fetchAll(), 5000);
    return () => window.clearInterval(id);
  }, [keysJoined, g.liveUpdates, fetchAll, keys.length]);

  const refreshCache = useCallback(async () => {
    try {
      await api.kite.instrumentsRefresh();
    } catch {
      /* ignore — fetchAll surfaces any remaining issue */
    }
    void fetchAll();
  }, [fetchAll]);

  // Market breadth (indices) for the Sentiment section.
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

  // Lock the plan snapshot the first time a signal arrives for an instrument.
  useEffect(() => {
    setLocked((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const k of Object.keys(signals)) {
        const d = signals[k]?.data;
        if (d && !next[k]) {
          next[k] = d;
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }, [signals]);

  // Re-analyse: re-lock the plan for an instrument from the latest signal.
  const reanalyse = useCallback(
    (key: string) => setLocked((cur) => (signals[key]?.data ? { ...cur, [key]: signals[key]!.data! } : cur)),
    [signals],
  );

  // Derive a view per assistant from the LOCKED snapshot (entry/SL/targets) with
  // live CMP overlaid + the instrument's virtual trade (Entry Scanner vs Position
  // Manager). Levels stay locked; only the action reacts to live CMP. ENTER NOW is
  // gated at >=75% confidence.
  const views = useMemo(() => {
    const out: Record<string, { view: AssistantView | null; managed: ActivePosition | null; lockedAt: number | null }> = {};
    for (const s of scanners) {
      const key = s.instrument.instrument;
      const lockedSig = locked[key] ?? null;
      const live = signals[key]?.data ?? null;
      const sig = lockedSig && live ? { ...lockedSig, currentPrice: live.currentPrice } : lockedSig ?? live;
      const t = vt.trades.find((x) => x.instrumentKey === key && x.status === "OPEN");
      const managed = t ? vtToPos(t) : null;
      let view = sig ? (managed ? derivePositionManager(sig, managed) : deriveEntryScanner(sig)) : null;
      if (view && sig) view = gateConfidence(view, sig);
      out[s.id] = { view, managed, lockedAt: lockedSig ? Date.parse(lockedSig.timestamp) : null };
    }
    return out;
  }, [scanners, signals, vt.trades, locked]);

  if (scanners.length === 0) return null;

  const expanded = scanners.filter((s) => s.state === "expanded");
  const frontId = expanded.length ? expanded.reduce((a, b) => (a.zIndex >= b.zIndex ? a : b)).id : null;
  const minimised = scanners.filter((s) => s.state === "minimised").sort((a, b) => a.createdAt - b.createdAt);

  const cmpOf = (s: Scanner) => signals[s.instrument.instrument]?.data?.currentPrice ?? null;

  const renderWindow = (s: Scanner, layout: "docked" | "floating" | "sheet") => {
    const st = signals[s.instrument.instrument] ?? { loading: true, updatedAt: 0 };
    const v = views[s.id] ?? { view: null, managed: null };
    return (
      <AssistantWindow
        key={s.id}
        scanner={s}
        layout={layout}
        data={st.data ?? null}
        view={v.view}
        managed={v.managed}
        error={st.error ?? null}
        loading={!!st.loading}
        updatedAt={st.updatedAt}
        breadth={breadth}
        liveOn={g.liveUpdates}
        vt={vt}
        isFront={s.id === frontId}
        pulseNonce={focusedId === s.id ? focusNonce : 0}
        onMinimise={() => minimise(s.id)}
        onClose={() => close(s.id)}
        onTogglePin={() => togglePin(s.id)}
        onFront={() => bringToFront(s.id)}
        onMove={(x, y) => setPosition(s.id, x, y)}
        onPopOut={(x, y) => popOut(s.id, x, y)}
        onRefreshCache={refreshCache}
        onReanalyse={() => reanalyse(s.instrument.instrument)}
        lockedAt={v.lockedAt}
      />
    );
  };

  // ---- mobile: only the front window as a bottom sheet; the rest become chips
  if (isMobile) {
    const front = expanded.find((s) => s.id === frontId) ?? null;
    const chips = scanners.filter((s) => s.id !== front?.id);
    return (
      <>
        {front && renderWindow(front, "sheet")}
        {chips.length > 0 && (
          <div style={{ zIndex: 70 }} className="fixed inset-x-2 top-2 flex gap-1.5 overflow-x-auto">
            {chips.map((s) => (
              <Chip key={s.id} scanner={s} cmp={cmpOf(s)} view={views[s.id]?.view ?? null} onOpen={() => focus(s.id)} onClose={() => close(s.id)} />
            ))}
          </div>
        )}
      </>
    );
  }

  // ---- desktop. Auto-aligned dock for every window the user hasn't dragged;
  // manually-dragged windows keep their own position.
  const free = expanded.filter((s) => s.dragged);
  const docked = expanded.filter((s) => !s.dragged).sort((a, b) => a.createdAt - b.createdAt);

  return (
    <>
      {/* Manually dragged windows (respect user position) */}
      {free.map((s) => renderWindow(s, "floating"))}

      {/* Auto-aligned dock, bottom-right, wrapping upward — tops aligned per row */}
      {docked.length > 0 && (
        <div style={{ zIndex: 80 }} className="pointer-events-none fixed bottom-4 right-4 flex max-w-[calc(100vw-2rem)] flex-wrap-reverse items-start justify-end gap-4">
          {docked.map((s) => (
            <div key={s.id} className="pointer-events-auto">
              {renderWindow(s, "docked")}
            </div>
          ))}
        </div>
      )}

      {/* Bottom-left dock: controls + minimised chips (wraps to fit many) */}
      <div style={{ zIndex: 70 }} className="fixed bottom-4 left-4 flex max-w-[min(62vw,560px)] flex-col items-start gap-1.5">
        {(expanded.length > 0 || minimised.some((s) => !s.pinned)) && (
          <div className="flex gap-1.5">
            {expanded.length > 0 && (
              <button type="button" onClick={minimiseAll} className="rounded-md border border-white/10 bg-base-900/90 px-2 py-0.5 text-[10px] text-slate-400 shadow-card backdrop-blur hover:text-slate-200">Minimise all</button>
            )}
            {minimised.some((s) => !s.pinned) && (
              <button type="button" onClick={closeAllUnpinned} className="rounded-md border border-white/10 bg-base-900/90 px-2 py-0.5 text-[10px] text-slate-400 shadow-card backdrop-blur hover:text-slate-200">Close unpinned</button>
            )}
          </div>
        )}
        {minimised.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {minimised.map((s) => (
              <Chip key={s.id} scanner={s} cmp={cmpOf(s)} view={views[s.id]?.view ?? null} onOpen={() => focus(s.id)} onClose={() => close(s.id)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Chip({ scanner, cmp, view, onOpen, onClose }: { scanner: Scanner; cmp: number | null; view: AssistantView | null; onOpen: () => void; onClose: () => void }) {
  const a = ACT[view ? actionTone(view) : "grey"];
  return (
    <button type="button" onClick={onOpen} title={`Open ${scanner.instrument.displayName}`} className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-base-900/95 px-2.5 py-1.5 shadow-card backdrop-blur ${a.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
      <span className="max-w-[120px] truncate text-[11px] font-semibold text-slate-100">{scanner.instrument.displayName}</span>
      <span className="num text-[11px] text-slate-400">{cmp == null ? "" : num(cmp)}</span>
      {view && <span className={`text-[10px] font-semibold uppercase ${a.text}`}>{view.label}</span>}
      {scanner.pinned && <span className="text-[10px]">📌</span>}
      <span role="button" tabIndex={-1} aria-label={`Close ${scanner.instrument.displayName}`} onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-slate-500 hover:text-bear">✕</span>
    </button>
  );
}

// =============================== window ===============================

function AssistantWindow({
  scanner,
  layout,
  data,
  view,
  managed,
  error,
  loading,
  updatedAt,
  breadth,
  liveOn,
  vt,
  isFront,
  pulseNonce,
  onMinimise,
  onClose,
  onTogglePin,
  onFront,
  onMove,
  onPopOut,
  onRefreshCache,
  onReanalyse,
  lockedAt,
}: {
  scanner: Scanner;
  layout: "docked" | "floating" | "sheet";
  data: LiveSignal | null;
  view: AssistantView | null;
  managed: ActivePosition | null;
  error: string | null;
  loading: boolean;
  updatedAt: number;
  breadth: { up: number; down: number } | null;
  liveOn: boolean;
  vt: ReturnType<typeof useAiVirtualTrades>;
  isFront: boolean;
  pulseNonce: number;
  onMinimise: () => void;
  onClose: () => void;
  onTogglePin: () => void;
  onFront: () => void;
  onMove: (x: number, y: number) => void;
  onPopOut: (x: number, y: number) => void;
  onRefreshCache: () => void;
  onReanalyse: () => void;
  lockedAt: number | null;
}) {
  const [tab, setTab] = useState<TabId>("summary");
  const [pos, setPos] = useState(scanner.position);
  const [pulse, setPulse] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const cardRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Keep local position synced with the store unless the user is dragging.
  useEffect(() => {
    if (!draggingRef.current) setPos(scanner.position);
  }, [scanner.position.x, scanner.position.y]);

  useEffect(() => {
    if (!pulseNonce) return;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 2200);
    return () => window.clearTimeout(id);
  }, [pulseNonce]);

  // Drag the header. A docked window "pops out" into free-floating mode at its
  // current on-screen position so it keeps where the user grabbed it.
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (layout === "sheet") return; // mobile bottom sheet is not draggable
    if ((e.target as HTMLElement).closest("button")) return;
    onFront();
    const rect = cardRef.current?.getBoundingClientRect();
    const startX = rect ? Math.round(rect.left) : posRef.current.x;
    const startY = rect ? Math.round(rect.top) : posRef.current.y;
    draggingRef.current = true;
    if (layout === "docked") onPopOut(startX, startY); // leave the aligned dock
    setPos({ x: startX, y: startY });
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => setPos({ x: clamp(startX + ev.clientX - sx, 0, window.innerWidth - 80), y: clamp(startY + ev.clientY - sy, 0, window.innerHeight - 60) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      draggingRef.current = false;
      onMove(posRef.current.x, posRef.current.y);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  };

  const cmp = data?.currentPrice ?? null;
  const itype = data?.resolvedInstrument.instrumentType ?? "";
  const friendly = !!error && /(not found|resolve|unsupported|invalid|no candle|instrument|unavailable|cache)/i.test(error);
  // Single action tone drives the outer border, glow, focus ring, dot and badge.
  const at: ActTone = view ? actionTone(view) : error && !data ? (friendly ? "grey" : "red") : "grey";
  const a = ACT[at];

  const frameStyle: React.CSSProperties =
    layout === "floating" ? { zIndex: scanner.zIndex, left: pos.x, top: pos.y, width: 360 } : layout === "sheet" ? { zIndex: scanner.zIndex } : {};
  const frameCls =
    layout === "floating"
      ? "fixed flex max-h-[78vh] w-[360px] flex-col"
      : layout === "sheet"
        ? "fixed inset-x-2 bottom-2 flex max-h-[82vh] flex-col"
        : "flex max-h-[72vh] w-[340px] flex-col"; // docked

  return (
    <div ref={cardRef} style={frameStyle} className={`${frameCls} overflow-hidden rounded-2xl border-2 ${a.border} ${a.glow} ${pulse ? `ring-2 ${a.ring}` : ""} bg-base-900/95 backdrop-blur transition-shadow`} onMouseDown={() => { if (!isFront && layout === "floating") onFront(); }}>
      {/* header */}
      <div onPointerDown={onHeaderPointerDown} className={`flex items-center gap-2 border-b border-white/10 px-3 py-2 ${layout === "sheet" ? "" : "cursor-move"}`}>
        <span className={`h-2 w-2 rounded-full ${a.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-100">{scanner.instrument.displayName}</p>
          <p className="num truncate text-[10px] text-slate-500">
            {scanner.instrument.exchange}{itype ? ` · ${itype}` : ""} · {lockedAt ? `🔒 ${new Date(lockedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : data ? `updated ${secsAgo(updatedAt)}` : loading ? "analysing…" : liveOn ? "—" : "live off"}
          </p>
        </div>
        {view && <span className="rounded-md border border-white/15 bg-base-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300">{view.mode === "POSITION_MANAGER" ? `Managing · ${managed?.source === "zerodha" ? "Zerodha" : "Virtual"}` : "Scanner"}</span>}
        <button type="button" onClick={onTogglePin} title={scanner.pinned ? "Unpin" : "Pin (dock bottom-right · restores on reload)"} className={`grid h-6 w-6 place-items-center rounded ${scanner.pinned ? "bg-accent/20 text-accent" : "text-slate-500 hover:text-slate-300"}`}>📌</button>
        <button type="button" onClick={onMinimise} title="Minimise" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-slate-300">▁</button>
        <button type="button" onClick={onClose} title="Close" className="grid h-6 w-6 place-items-center rounded text-slate-500 hover:text-bear">✕</button>
      </div>

      {/* states */}
      {!view ? (
        error && !data ? (
          <div className="space-y-2 px-3 py-4 text-center">
            <p className="text-sm font-semibold text-slate-200">{friendly ? "Instrument unavailable" : "Can't reach live data"}</p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {friendly
                ? `Couldn't resolve ${scanner.instrument.displayName} in the Kite instruments cache, or it isn't quotable. Refresh the cache, or remove it and pick it again from search.`
                : "The backend didn't respond. It will retry automatically while live updates are on."}
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={async () => { setRefreshing(true); try { await onRefreshCache(); } finally { setRefreshing(false); } }}
                disabled={refreshing}
                className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh instruments cache"}
              </button>
              <button type="button" onClick={onClose} className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200">Remove</button>
            </div>
          </div>
        ) : (
          <p className="px-3 py-6 text-center text-xs text-slate-500">Analysing {scanner.instrument.displayName}…</p>
        )
      ) : (
        <>
          {/* summary */}
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-bold uppercase tracking-wide ${a.badge}`}>{view.label}</span>
              <div className="text-right">
                <p className="num text-xl font-bold text-slate-100">{cmp == null ? "—" : num(cmp)}</p>
                <p className="text-[9px] uppercase text-slate-500">CMP</p>
              </div>
            </div>
            {data && (
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
              <Pill label="Win est." value={view.confidencePercent == null ? "—" : `${view.confidencePercent}%`} cls="border-white/10 text-slate-200" sub="backend prob." />
              <Pill label="R:R" value={view.riskReward ?? "—"} cls="border-white/10 text-slate-200" />
            </div>
          </div>

          <div className="flex shrink-0 gap-1 border-b border-white/10 px-2 py-1.5">
            {(["summary", "time", "risk", "details"] as TabId[]).map((id) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 rounded-md px-1 py-1 text-[11px] font-semibold capitalize ${tab === id ? "bg-accent/15 text-accent" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
                {id === "time" ? "Time" : id}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {tab === "summary" && <TabSummary view={view} data={data} managed={managed} vt={vt} />}
            {tab === "time" && data && <TabTime signal={data} />}
            {tab === "risk" && data && <TabRisk view={view} signal={data} breadth={breadth} />}
            {tab === "details" && data && <TabDetails signal={data} view={view} />}
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-3 py-1.5 text-[10px] text-slate-500">
        <span>🔒 Locked levels · live CMP · no orders</span>
        <button type="button" onClick={onReanalyse} className="rounded border border-accent/30 px-1.5 py-0.5 font-semibold text-accent hover:bg-accent/10">Re-analyse</button>
      </div>
    </div>
  );
}

// =============================== tabs ===============================

function TabSummary({ view, data, managed, vt }: { view: AssistantView; data: LiveSignal | null; managed: ActivePosition | null; vt: ReturnType<typeof useAiVirtualTrades> }) {
  const a = ACT[actionTone(view)];
  return (
    <div className="space-y-2.5">
      <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${a.badge}`}>{view.action}</p>
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
      {managed && <p className="text-[10px] text-slate-500">Managing a {managed.source === "zerodha" ? "Zerodha" : "virtual"} position — guidance reflects your entry ₹{num(managed.entryPrice)}.</p>}
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
      <p className="text-[11px] leading-relaxed text-slate-400"><span className="font-semibold text-slate-200">Win estimate</span> ({view.confidencePercent == null ? "—" : `${view.confidencePercent}%`}) is the backend probability. ENTER NOW needs win est. ≥{MIN_WIN_ESTIMATE}% AND setup strength ≥{MIN_SETUP_STRENGTH}% — never a guarantee.</p>
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
  if (!then) return "now";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  return s < 1 ? "now" : `${s}s ago`;
}
