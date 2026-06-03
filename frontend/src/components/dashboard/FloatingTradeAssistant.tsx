"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertToasts } from "./AlertToasts";
import {
  deriveAssistant,
  noSelectionView,
  offlineView,
  staleView,
  type AssistantTone,
  type AssistantView,
} from "@/lib/tradeAssistant";
import type { LiveSignal, TopMoversResponse } from "@/types/api";

const POLL_MS = 4000; // 3–5s while global live updates are ON
const STALE_MS = 20_000; // mark data stale if no successful read in this long
const SOUND_COOLDOWN_MS = 15_000;
const OPEN_KEY = "trade-ui.assistant.open.v1";
const PINNED_KEY = "trade-ui.assistant.pinned.v1";
const MUTED_KEY = "trade-ui.assistant.muted.v1";

const TONE: Record<AssistantTone, { chip: string; ring: string; dot: string; text: string }> = {
  bull: { chip: "border-bull/40 bg-bull-soft text-bull", ring: "border-bull/40", dot: "bg-bull", text: "text-bull" },
  bear: { chip: "border-bear/40 bg-bear-soft text-bear", ring: "border-bear/40", dot: "bg-bear", text: "text-bear" },
  warn: { chip: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal", ring: "border-neutralSignal/40", dot: "bg-neutralSignal", text: "text-neutralSignal" },
  info: { chip: "border-accent/40 bg-accent/10 text-accent", ring: "border-accent/40", dot: "bg-accent", text: "text-accent" },
  neutral: { chip: "border-white/10 bg-base-800 text-slate-300", ring: "border-white/10", dot: "bg-slate-500", text: "text-slate-300" },
};

/**
 * Floating AI Trade Assistant (Phase 3L). A sticky, always-on advisor that
 * follows the globally-selected instrument and continuously reads the live
 * signal (3–5s while global live updates are ON). It collapses to a bar on
 * mobile / a pill on desktop, and raises advisory alerts (ENTER/EXIT/BOOK
 * PARTIAL/AVOID) — never any order. All numbers come from the backend signal.
 */
export function FloatingTradeAssistant() {
  const g = useGlobalControls();
  const alerts = useAlerts();
  const instrument = g.selectedInstrument?.instrument || null;
  const displayName = g.selectedInstrument?.displayName || instrument || "";

  const [data, setData] = useState<LiveSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOkAt, setLastOkAt] = useState(0);
  const [movers, setMovers] = useState<TopMoversResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [open, setOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [muted, setMuted] = useState(true);
  const lastSound = useRef(0);

  // Hydrate UI prefs.
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
  const toggleOpen = () => setOpen((v) => (persist(OPEN_KEY, !v), !v));
  const togglePinned = () => setPinned((v) => (persist(PINNED_KEY, !v), !v));
  const toggleMuted = () => setMuted((v) => (persist(MUTED_KEY, !v), !v));

  // Signal polling. One immediate read on instrument change; continue every few
  // seconds only while global live updates are ON. Runs even when collapsed so
  // alerts still fire.
  const fetchSignal = useCallback(async () => {
    if (!instrument) return;
    try {
      const res = await api.liveSignal({ instrument, interval: "5minute", riskProfile: "balanced" });
      setData(res);
      setError(null);
      setLastOkAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach the backend.");
    }
  }, [instrument]);

  // Reset only when the instrument actually changes (not on a live-toggle).
  useEffect(() => {
    setData(null);
    setError(null);
  }, [instrument]);

  useEffect(() => {
    if (!instrument) return;
    void fetchSignal();
    if (!g.liveUpdates) return;
    const id = window.setInterval(() => void fetchSignal(), POLL_MS);
    return () => window.clearInterval(id);
  }, [instrument, g.liveUpdates, fetchSignal]);

  // Tick so the "stale" check and "updated Ns ago" stay fresh between polls.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Market breadth (indices) — best-effort, real data. Refreshed slowly.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.topMovers("indices");
        if (!cancelled) setMovers(r);
      } catch {
        if (!cancelled) setMovers(null);
      }
    };
    void load();
    const id = window.setInterval(load, 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Build the current view.
  const stale = !!data && g.liveUpdates && now - lastOkAt > STALE_MS;
  let view: AssistantView;
  if (!instrument) view = noSelectionView();
  else if (error && !data) view = offlineView(error);
  else if (data) view = stale ? staleView(deriveAssistant(data)) : deriveAssistant(data);
  else view = loadingView();
  const connecting = !!error && !!data; // transient hiccup but we still have a read

  // Fire advisory alerts on alert-worthy state changes (gated by the global
  // alerts preference; de-duplicated by useAlerts' per-key cooldown).
  const viewRef = useRef(view);
  viewRef.current = view;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(() => {
    const v = viewRef.current;
    if (!v.alert || !data || !g.alertsEnabled) return;
    const name = data.resolvedInstrument.displayName || data.instrument;
    const key = `assist-${v.state}-${data.resolvedInstrument.instrumentKey}`;
    alerts.push(key, `${name}: ${v.label}`, v.alert.message, v.alert.severity);
    if (v.alert.sound && !mutedRef.current) beep(v.state === "EXIT_NOW" ? 440 : v.state === "ENTER_NOW" ? 660 : 550, v.state === "EXIT_NOW", lastSound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.state, data?.resolvedInstrument.instrumentKey, g.alertsEnabled]);

  const t = TONE[view.tone];
  const breadthInfo = breadth(movers);

  return (
    <div className="fixed inset-x-2 bottom-2 z-40 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[384px]">
      {open ? (
        <div className={`overflow-hidden rounded-2xl border ${t.ring} bg-base-900/95 shadow-card backdrop-blur`}>
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <span className="relative flex h-2.5 w-2.5">
              {g.liveUpdates && !connecting && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${t.dot} opacity-60`} />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${t.dot}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-100">AI Trade Assistant</p>
              <p className="truncate text-[11px] text-slate-500">
                {displayName || "No instrument"} · 5m{" "}
                {connecting ? "· reconnecting…" : g.liveUpdates ? `· updated ${secsAgo(now, lastOkAt)}` : "· live off"}
              </p>
            </div>
            <button type="button" onClick={toggleMuted} title={muted ? "Sound off" : "Sound on"} aria-label="Toggle sound" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-200">
              {muted ? "🔇" : "🔔"}
            </button>
            <button type="button" onClick={togglePinned} title={pinned ? "Unpin" : "Pin open"} aria-label="Toggle pin" className={`grid h-7 w-7 place-items-center rounded-md hover:bg-white/10 ${pinned ? "text-accent" : "text-slate-400 hover:text-slate-200"}`}>
              📌
            </button>
            <button type="button" onClick={toggleOpen} title="Collapse" aria-label="Collapse" className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-200">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[60vh] space-y-3 overflow-y-auto px-3 py-3">
            {/* State + LTP */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-bold uppercase tracking-wide ${t.chip}`}>
                  {view.label}
                </span>
                {view.direction !== "NONE" && (
                  <span className="ml-2 text-[11px] font-semibold uppercase text-slate-500">{view.direction}</span>
                )}
              </div>
              <div className="text-right">
                <p className="num text-2xl font-bold text-slate-100">{view.ltp == null ? "—" : num(view.ltp)}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">LTP</p>
              </div>
            </div>

            {/* Action */}
            <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${t.chip}`}>{view.action}</p>

            {/* Confidence + sentiment */}
            {view.confidencePercent != null && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Confidence score</p>
                  <p className={`text-sm font-bold ${confColor(view.confidenceLabel)}`}>
                    {cap(view.confidenceLabel)} · est. {view.confidencePercent}%
                  </p>
                  <p className="text-[10px] text-slate-500">Estimated probability — not guaranteed.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2">
                  <p className="text-[11px] text-slate-500">Market breadth (indices)</p>
                  <p className={`text-sm font-bold ${TONE[breadthInfo.tone].text}`}>{breadthInfo.text}</p>
                  <p className="text-[10px] text-slate-500">News sentiment: unavailable</p>
                </div>
              </div>
            )}

            {/* Factors */}
            {view.factors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {view.factors.map((fac, i) => (
                  <span
                    key={i}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      fac.dir === "bullish"
                        ? "border-bull/30 bg-bull-soft text-bull"
                        : fac.dir === "bearish"
                          ? "border-bear/30 bg-bear-soft text-bear"
                          : "border-white/10 bg-base-800 text-slate-400"
                    }`}
                  >
                    {fac.text}
                  </span>
                ))}
              </div>
            )}

            {/* Levels */}
            {hasLevels(view) && (
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <LevelChip label="Entry" value={view.levels.entry} tone="info" />
                <LevelChip label="Stop-loss" value={view.levels.stopLoss} tone="bear" />
                <LevelChip label="Target 1" value={view.levels.target1} tone="bull" />
                <LevelChip label="Target 2" value={view.levels.target2} tone="bull" />
                <LevelChip label="Trail SL" value={view.levels.trail} tone="warn" />
                <LevelChip label="Invalidation" value={view.levels.invalidation} tone="bear" />
              </div>
            )}

            {/* Reason + risk */}
            <p className="rounded-lg border border-white/5 bg-base-800/40 px-3 py-2 text-xs leading-relaxed text-slate-300">
              <span className="font-semibold text-slate-100">Why: </span>
              {view.reason}
            </p>
            {view.riskFactor && (
              <p className="rounded-lg border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[11px] leading-relaxed text-neutralSignal">
                <span className="font-semibold">Risk: </span>
                {view.riskFactor}
              </p>
            )}

            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Advisory · read-only · no orders</span>
              <button type="button" onClick={() => void fetchSignal()} className="rounded border border-white/10 px-2 py-0.5 text-slate-400 hover:text-slate-200">
                Refresh
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Collapsed bar (mobile) / pill (desktop)
        <button
          type="button"
          onClick={toggleOpen}
          className={`flex w-full items-center gap-2 rounded-full border ${t.ring} bg-base-900/95 px-3 py-2 text-left shadow-card backdrop-blur`}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {g.liveUpdates && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${t.dot} opacity-60`} />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${t.dot}`} />
          </span>
          <span className={`text-xs font-bold uppercase tracking-wide ${t.text}`}>{view.label}</span>
          <span className="truncate text-[11px] text-slate-400">{displayName}</span>
          <span className="num ml-auto text-sm font-semibold text-slate-100">{view.ltp == null ? "" : num(view.ltp)}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-slate-400">
            <path d="M18 15l-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <AlertToasts toasts={alerts.toasts} onDismiss={alerts.dismiss} />
    </div>
  );
}

function LevelChip({ label, value, tone }: { label: string; value: number | null; tone: AssistantTone }) {
  if (value == null) return null;
  const t = TONE[tone];
  return (
    <div className={`flex items-baseline justify-between rounded-md border px-2 py-1 ${t.chip}`}>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
      <span className="num text-sm font-bold">₹{num(value)}</span>
    </div>
  );
}

function loadingView(): AssistantView {
  return {
    state: "WAIT_FOR_SETUP",
    label: "Reading…",
    tone: "neutral",
    direction: "NONE",
    action: "Fetching the live signal for the selected instrument…",
    reason: "Connecting to live Kite data via the backend.",
    ltp: null,
    confidencePercent: null,
    confidenceLabel: null,
    dataQuality: null,
    riskFactor: "",
    factors: [],
    levels: { entry: null, stopLoss: null, target1: null, target2: null, target3: null, trail: null, invalidation: null, support1: null, resistance1: null },
    alert: null,
  };
}

function hasLevels(v: AssistantView): boolean {
  const l = v.levels;
  return [l.entry, l.stopLoss, l.target1, l.target2, l.trail, l.invalidation].some((x) => x != null);
}

function breadth(mv: TopMoversResponse | null): { text: string; tone: AssistantTone } {
  if (!mv) return { text: "unavailable (needs live Kite)", tone: "neutral" };
  const up = mv.gainers.length;
  const down = mv.losers.length;
  if (up + down === 0) return { text: "unavailable", tone: "neutral" };
  const tone: AssistantTone = up > down ? "bull" : down > up ? "bear" : "neutral";
  return { text: `${up} up / ${down} down`, tone };
}

function confColor(label: "low" | "medium" | "high" | null): string {
  return label === "high" ? "text-bull" : label === "medium" ? "text-neutralSignal" : "text-slate-400";
}

function cap(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(urgent ? [120, 60, 120] : 80);
    }
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
