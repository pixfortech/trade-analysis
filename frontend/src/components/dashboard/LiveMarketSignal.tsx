"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import type { IndicatorId, LiveSignal } from "@/types/api";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
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
import { useAnalysisSession } from "@/hooks/useAnalysisSession";
import { useInstrumentTick, useTickStreamStatus } from "@/hooks/useTickStream";
import { useDecisionStream, type DecisionStreamPlan } from "@/hooks/useDecisionStream";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import { Icon } from "@/components/terminal/ds";
import { buildTradePlan, evaluatePlan, computePointsToAction, MIN_SETUP_STRENGTH, type TradePlanSnapshot } from "@/lib/tradePlan";
import { TentativePnL } from "./TentativePnL";
import { unlockAudio, playEntryBeep } from "@/lib/beep";

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
  const as = useAnalysisSession();
  const cfg = usePublicConfig();
  const sel = global.selectedInstrument;
  // Durable controls — live in AnalysisSessionProvider so they (and the locked
  // plan / monitoring baseline below) survive a cockpit screen switch and reload.
  const interval = as.interval;
  const riskProfile = as.riskProfile;
  const segment = (as.segment as InstrumentSegment) || "all";
  const setInterval = as.setInterval;
  const setRiskProfile = as.setRiskProfile;
  const setSegment = useCallback((v: InstrumentSegment) => as.setSegment(v), [as]);
  const active = useMemo<IndicatorId[]>(() => cfg.defaults.activeIndicators as IndicatorId[], [cfg.defaults.activeIndicators]);
  const signal = useAsync(api.liveSignal);
  const alerts = useAlerts();
  const prevTrend = useRef<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  const [vix, setVix] = useState<number | null>(null);

  const referenceOnly = !!sel && sel.quotable === false;

  // The LOCKED trade plan is derived from the durable session ONLY when it matches
  // the current (instrument, timeframe, mode) triple — so switching screens keeps
  // it, while changing timeframe/mode/instrument correctly stops showing stale
  // locked levels (no on-mount reset that a screen switch would wrongly fire).
  const activeSession =
    as.session && sel && as.session.instrumentKey === sel.instrument && as.session.interval === interval && as.session.riskProfile === riskProfile
      ? as.session
      : null;
  const plan = activeSession?.plan ?? null;

  // Real-time decision snapshot (single source of truth) for the strip + tabs.
  const dec = useDecision(sel && sel.quotable !== false ? sel.instrument : null, interval, riskProfile, global.liveUpdates);

  // LIVE tick from the Kite→SSE relay for the selected instrument (+ India VIX).
  // This is the PRIMARY CMP source: a fresh tick drives CMP / points-to-entry /
  // movement / entry-zone / stop-target checks immediately, without the 5s poll.
  const selKey = sel && sel.quotable !== false ? sel.instrument : null;
  const liveTick = useInstrumentTick(selKey);
  const vixTick = useInstrumentTick(cfg.defaults.vixQuoteSymbol);
  const stream = useTickStreamStatus();
  const tickCmp = liveTick.fresh && liveTick.tick ? liveTick.tick.ltp : null;
  const tickMs = tickCmp != null && liveTick.tick ? liveTick.tick.tsMs : null;
  const liveCmp = tickCmp ?? signal.data?.currentPrice ?? null;

  // Continuous monitoring — DERIVED over the durable session. Fed the WS tick
  // price so movement / MFE / MAE / distance update per tick.
  const mon = useMonitoringSession({ session: activeSession, signal: signal.data ?? null, decision: dec.d, chart: null, live: global.liveUpdates, bumpExcursion: as.bumpExcursion, liveCmp: tickCmp, tickMs });
  const tz = cfg.session.timezone;

  // Unified market liveness comes from the WEBSOCKET CONNECTION state — never from
  // an arbitrary few-second tick gap (§9/§11). A locked ENTER is blocked only when
  // the feed is GENUINELY unavailable (stream disconnected, or no data at all for a
  // long window), not because ticks briefly paused between trades.
  const lastDataMs = tickMs ?? mon.lastTickMs;
  const dataAgeMs = lastDataMs != null ? Date.now() - lastDataMs : null;
  const genuinelyStale = stream.state === "DISCONNECTED" || (stream.state !== "LIVE" && stream.state !== "DISABLED" && dataAgeMs != null && dataAgeMs > cfg.stream.quoteStaleSec * 1000);

  // Evidence freshness (§15): the APPROVAL EVIDENCE (indicators) refreshes on the
  // liveSignal poll, NOT per tick. If that poll has not landed within evidenceStaleMs
  // (backend down / poll failing), a fresh ENTER is blocked even while CMP ticks —
  // never a "LIVE" approval on stale evidence. This is a documented current
  // limitation: indicators are poll-fresh, not tick-fresh (see the audit report).
  const evidenceOkAtRef = useRef<number | null>(null);
  useEffect(() => { if (signal.data) evidenceOkAtRef.current = Date.now(); }, [signal.data]);
  const evidenceStale = evidenceOkAtRef.current != null && Date.now() - evidenceOkAtRef.current > cfg.trade.evidenceStaleMs;

  // Locked-plan live evaluation from the CURRENT price. Levels are LOCKED; only the
  // state/approval/distance/R:R change per tick. PREPARE + late-entry are config-driven.
  const evalResult = plan && signal.data ? evaluatePlan(plan, liveCmp, signal.data, null, { continuationAtrMult: cfg.trade.continuationAtrMult, dataStale: genuinelyStale, evidenceStale, prepare: cfg.trade.prepare, lateEntryMinRR: cfg.trade.lateEntryMinRR }) : null;
  const points = plan && signal.data ? computePointsToAction(plan, liveCmp, activeSession?.analysedCmp ?? null) : null;
  const monitorSummary = mon.hasSession ? { analysedCmp: mon.analysedCmp ?? 0, liveCmp: mon.liveCmp, movement: mon.movement, movementPct: mon.movementPct, distToTrigger: mon.distToTrigger, candleState: mon.candleState } : null;

  // REAL-TIME DECISION STREAM (§11–§14): the backend decision authority streams a
  // COHERENT snapshot (CMP + indicators + evidence + win + action from the SAME
  // tick-built candle) for the LOCKED plan. When authoritative it drives the
  // action + notifications; the client evalResult + polls are the FALLBACK.
  const streamPlan: DecisionStreamPlan | null =
    plan && plan.direction !== "WAIT" && plan.entry != null && plan.safeLow != null && plan.safeHigh != null && plan.stopLoss != null && plan.targets[0] != null && plan.invalidation != null && activeSession
      ? { direction: plan.direction, entry: plan.entry, safeLow: plan.safeLow, safeHigh: plan.safeHigh, stop: plan.stopLoss, target1: plan.targets[0]!, target2: plan.targets[1] ?? null, invalidation: plan.invalidation, atr: plan.snapshot.atr, analysedCmp: activeSession.analysedCmp, analysedAtMs: activeSession.analysedAt }
      : null;
  const ds = useDecisionStream({ instrument: selKey, interval, plan: streamPlan, enabled: !!streamPlan });
  const rt = ds.authoritative ? ds.snapshot : null; // authoritative backend decision, or null → fallback

  // Unified action vocabulary (backend authoritative when live, else client eval).
  const clientAction = evalResult?.state === "ENTER_NOW" ? (evalResult.lateEntry ? "ENTER_CONTINUATION" : "ENTER") : evalResult?.state === "PREPARE" ? "PREPARE" : evalResult?.state === "REVERSAL_RISK" ? "REVERSAL_RISK" : evalResult?.state === "WAIT_PULLBACK" ? "WAIT_PULLBACK" : evalResult?.state ? "WAIT" : "";
  const authAction = rt ? rt.action : clientAction;

  // PLAN-STALENESS GUIDANCE. The locked plan (Entry/SL/Targets/Safe-zone/
  // invalidation + analysed CMP/time) NEVER moves on a tick or a price threshold —
  // it changes ONLY on explicit Re-analyse / instrument / timeframe / mode change /
  // accepting a fresh setup. When price has drifted far from the LOCKED analysed
  // CMP, or the plan is void, or the backend sees a fresh setup, we PROMPT an
  // explicit Re-analyse — we never regenerate the levels ourselves.
  const lockedAnalysedCmp = activeSession?.analysedCmp ?? null;
  const movePct = liveCmp != null && lockedAnalysedCmp ? Math.abs((liveCmp - lockedAnalysedCmp) / lockedAnalysedCmp) * 100 : 0;
  const planStale = !!plan && plan.direction !== "WAIT" && movePct > cfg.trade.planStaleMovePct;
  const planGuidance: { text: string; tone: "avoid" | "exit" } | null =
    !plan || plan.direction === "WAIT"
      ? null
      : evalResult?.state === "INVALIDATED"
        ? { text: "PLAN VOID — Re-analyse required", tone: "exit" }
        : planStale
          ? dec.d?.freshSetup
            ? { text: "Fresh setup detected — Re-analyse to generate new locked levels", tone: "avoid" }
            : { text: "Plan no longer optimal — Re-analyse recommended", tone: "avoid" }
          : null;

  // Unified market status (§10/§11) — ONE market state driven by the WebSocket
  // connection, not an arbitrary tick gap. Live · Delayed (reconnecting) ·
  // Connecting · Feed unavailable (genuine disconnect) · Paused.
  const market: { label: string; tone: "enter" | "avoid" | "exit" | "none" } = !global.liveUpdates
    ? { label: "Paused", tone: "none" }
    : genuinelyStale || stream.state === "DISCONNECTED"
      ? { label: "Feed unavailable", tone: "exit" }
      : stream.state === "DEGRADED"
        ? { label: "Delayed", tone: "avoid" }
        : stream.state === "CONNECTING"
          ? { label: "Connecting", tone: "avoid" }
          : { label: "Live", tone: "enter" };

  // P/L presentation gate. Active (green) ONLY when entry is approved AND data is
  // fresh; PLAN VOID when the locked invalidation is broken; otherwise a disabled
  // scenario with one concise reason (Win/setup/stale/state).
  const planVoid = evalResult?.state === "INVALIDATED";
  const reversalRisk = evalResult?.state === "REVERSAL_RISK";
  const pnlApproved = evalResult?.state === "ENTER_NOW" && !!evalResult.approved && !genuinelyStale;
  const notApprovedReason = useMemo<string | null>(() => {
    if (!plan || plan.direction === "WAIT" || pnlApproved) return null;
    if (planVoid) return "Plan void — the locked invalidation level was broken. Re-analyse for a fresh plan.";
    if (reversalRisk) return `No safe fresh entry — ${evalResult?.reason ?? "breakout failed and reversal evidence is building."}`;
    const parts: string[] = [];
    const minWin = dec.d?.approval.minWin ?? cfg.winThreshold;
    if (plan.winEstimate < minWin) parts.push(`Win ${plan.winEstimate}% < required ${minWin}%`);
    if (plan.setupStrength < MIN_SETUP_STRENGTH) parts.push(`setup ${plan.setupStrength}% < ${MIN_SETUP_STRENGTH}%`);
    if (genuinelyStale) parts.push("market feed unavailable");
    const st = evalResult?.state;
    if (st === "AVOID") parts.push("conditions unfavourable");
    else if (st === "WAIT_BREAKOUT") parts.push("price hasn't reached the entry trigger");
    else if (st === "WAIT_PULLBACK") parts.push("price past the safe zone — wait for a pullback");
    else if (st === "WAIT_CONFIRMATION" && parts.length === 0) parts.push("awaiting confirmation");
    else if (st === "WAIT_SETUP" && parts.length === 0) parts.push("no valid setup");
    if (parts.length === 0) parts.push("entry gates not satisfied");
    return `Not approved: ${parts.join("; ")}.`;
  }, [plan, pnlApproved, planVoid, reversalRisk, genuinelyStale, evalResult?.state, evalResult?.reason, dec.d, cfg.winThreshold]);

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
    return res ?? null;
  }, [sel, interval, riskProfile, active, signal, alerts]);

  const analyze = useCallback(async () => {
    unlockAudio(); // this click is the user gesture that enables the ENTER blip
    const res = await run();
    if (res && sel) {
      const built = buildTradePlan(res, interval, riskProfile);
      as.startSession({
        instrumentKey: sel.instrument,
        displayName: sel.displayName,
        interval,
        riskProfile,
        plan: built,
        analysedCmp: res.currentPrice,
        analysedAt: Number.isNaN(Date.parse(res.timestamp)) ? null : Date.parse(res.timestamp),
      });
    }
    void dec.reload();
  }, [run, interval, riskProfile, dec, sel, as]);

  // RESET — stop monitoring, clear the analysed instrument / locked plan /
  // decision / news-VIX / alerts / saved session, and return to a blank search.
  // Deliberately does NOT disconnect Kite, delete the Watchlist, or reset modules.
  const reset = useCallback(() => {
    as.clearSession();
    global.setSelectedInstrument(null);
    signal.reset();
    setVix(null);
    prevTrend.current = null;
    setResolveNote(null);
  }, [as, global, signal]);

  // Auto-RESUME: on (re)mount with a matching saved session but no live data yet,
  // fetch fresh live signal + chart once so monitoring resumes WITHOUT rebuilding
  // the locked plan. This is what makes returning to the tab restore the session.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !as.hydrated) return;
    if (activeSession && sel && sel.quotable !== false && signal.isIdle) {
      resumedRef.current = true;
      void run();
      void dec.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [as.hydrated, activeSession, sel, signal.isIdle]);

  // BUZZ on the transition INTO a valid, approved, fresh-data ENTER (transition-
  // based, per-session dedupe, config cooldown, sound toggle). In-app toast
  // always; browser notification if granted; short sound if enabled. Suppressed
  // when not approved OR data is stale (mirrors the P/L gate). Audio was unlocked
  // by the Analyse click.
  const prevEnterValid = useRef(false);
  const lastEnterAlertAt = useRef<number>(0);
  useEffect(() => {
    // Backend action wins when the realtime stream is authoritative; else client eval.
    const enterValid = (authAction === "ENTER" || authAction === "ENTER_CONTINUATION") && (rt ? rt.approved : !!evalResult?.approved) && !genuinelyStale;
    if (enterValid && !prevEnterValid.current && activeSession) {
      const now = Date.now();
      if (now - lastEnterAlertAt.current >= cfg.trade.alerts.enterCooldownMs) {
        lastEnterAlertAt.current = now;
        alerts.push(`enter-${activeSession.instrumentKey}`, `ENTER ${plan?.direction ?? ""} approved`, `${sel?.displayName ?? activeSession.displayName}: ${evalResult?.reason ?? "Entry gates satisfied."}`, "urgent");
        if (cfg.trade.alerts.soundEnabled) playEntryBeep();
      }
    }
    prevEnterValid.current = enterValid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authAction, rt?.approved, evalResult?.approved, genuinelyStale, activeSession]);

  // GET READY notification (§2/§17): fires ONCE on the transition INTO the PREPARE
  // proximity state (per-session dedupe + config cooldown). One short sound if
  // enabled — never repeated every tick while lingering near the entry.
  const prevPrepare = useRef(false);
  const lastPrepareAlertAt = useRef<number>(0);
  useEffect(() => {
    const isPrepare = authAction === "PREPARE";
    if (isPrepare && !prevPrepare.current && activeSession) {
      const now = Date.now();
      if (now - lastPrepareAlertAt.current >= cfg.trade.alerts.enterCooldownMs) {
        lastPrepareAlertAt.current = now;
        alerts.push(`prepare-${activeSession.instrumentKey}`, `Get ready to ${plan?.direction === "LONG" ? "enter" : "short"}`, `${sel?.displayName ?? activeSession.displayName}: preferred entry is approaching. ${evalResult?.reason ?? ""}`, "caution");
        if (cfg.trade.alerts.soundEnabled) playEntryBeep();
      }
    }
    prevPrepare.current = isPrepare;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authAction, activeSession]);

  // NOTE: there is deliberately NO price-triggered auto re-analysis. A tick or a
  // price-movement threshold must never regenerate the locked Entry/SL/Targets.
  // The live approval/action/points/continuation/reversal recompute every tick
  // against the LOCKED plan; the locked levels change only on explicit Re-analyse
  // (or instrument / timeframe / mode change). Below, price drift only PROMPTS a
  // Re-analyse via planGuidance — it never rewrites the plan.

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
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Selected instrument identity — its own line so it never squeezes the controls. */}
            <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{sel.displayName}</span>
              <span className="num" style={{ fontSize: 11, color: "var(--ink-4)" }}>{sel.instrument}{sel.lotSize ? ` · lot ${sel.lotSize}` : ""}</span>
              {!sel.quotable && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--action-avoid)", border: "1px solid var(--action-avoid-border)", borderRadius: 3, padding: "0 4px" }}>reference</span>}
            </div>
            {/* Controls — responsive: selects grow to fit full labels; buttons stay
                together; the whole row wraps cleanly with no clipping. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <ThemedSelect value={interval} onChange={setInterval} ariaLabel="Timeframe" className="min-w-[116px] flex-1 basis-[116px] max-w-[180px]" options={INTERVALS.map((i) => ({ value: i, label: i }))} />
              <ThemedSelect value={riskProfile} onChange={setRiskProfile} ariaLabel="Strategy mode" className="min-w-[150px] flex-1 basis-[150px] max-w-[220px]" options={STRATEGY_MODES.map((m) => ({ value: m.value, label: m.label }))} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => void analyze()} disabled={signal.isLoading || referenceOnly} title="Lock a fresh trade plan"
                  style={{ height: 32, padding: "0 14px", borderRadius: "var(--radius-md)", border: "none", background: "var(--brand-500)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: signal.isLoading || referenceOnly ? "not-allowed" : "pointer", opacity: signal.isLoading || referenceOnly ? 0.5 : 1, whiteSpace: "nowrap" }}>
                  {signal.isLoading ? "Analysing…" : plan ? "Re-analyse" : "Analyse"}
                </button>
                <button type="button" onClick={reset} title="Reset — stop monitoring, clear selection & plan (keeps Kite, watchlist & modules)"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                  <Icon n="refresh" size={13} /> Reset
                </button>
                <button type="button" onClick={() => global.setSelectedInstrument(null)} title="Clear selection" aria-label="Clear" style={{ width: 32, height: 32, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-3)", cursor: "pointer", flexShrink: 0 }}><Icon n="x" size={14} /></button>
              </div>
            </div>
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
          {/* OHLC — compact inline stats (driven by the signal; chart removed) */}
          <OhlcStrip signal={signal.data} chart={null} />

          {/* Monitoring proof strip — ONE unified MARKET status (§10/§11) driven by
              the WebSocket connection, plus same-state source timestamps. No
              candle-stale label; the current candle is tick-built server-side. */}
          {mon.hasSession && (() => {
            const color = market.tone === "enter" ? "var(--action-enter)" : market.tone === "avoid" ? "var(--action-avoid)" : market.tone === "exit" ? "var(--action-exit)" : "var(--ink-3)";
            return (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 10.5, color: "var(--ink-3)", padding: "3px 4px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color }} title={stream.message || undefined}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                  MARKET {market.label}
                </span>
                <span>· tick <span className="num">{fmtMarketTime(tickMs ?? mon.lastTickMs, tz) ?? "—"}</span></span>
                <span className="hide-sm">· decision <span className="num">{fmtMarketTime(dec.refreshedAt, tz) ?? "—"}</span></span>
                <span className="hide-sm">· VIX <span className="num">{fmtMarketTime(mon.lastVixMs, tz, false) ?? "n/a"}</span></span>
                <span className="hide-sm">· news <span className="num">{fmtMarketTime(mon.lastNewsMs, tz, false) ?? "n/a"}</span></span>
                {mon.mfe != null && <span className="hide-sm">· MFE <span className="num" style={{ color: "var(--price-up)" }}>+{mon.mfe}</span> / MAE <span className="num" style={{ color: "var(--price-down)" }}>-{mon.mae}</span></span>}
              </div>
            );
          })()}

          {/* REAL-TIME DECISION — the backend authority (§14/§16). CMP + indicators
              + evidence + win + action from ONE coherent tick-built state. Shown
              only when the decision stream is authoritative; else the strip below
              is the poll fallback. */}
          {rt && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 10.5, color: "var(--ink-3)", padding: "4px 6px", borderRadius: "var(--radius-md)", border: "1px solid var(--action-enter-border, var(--border-2))", background: "var(--surface-sunken)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: "var(--action-enter)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--action-enter)" }} /> STREAM LIVE
              </span>
              <span style={{ fontWeight: 800, color: "var(--ink-1)" }}>{rt.action.replace(/_/g, " ")}</span>
              <span>· win <span className="num" style={{ fontWeight: 700 }}>{rt.winEstimate}%</span></span>
              <span>· tick <span className="num">{fmtMarketTime(rt.freshness.tickReceivedMs, tz) ?? "—"}</span></span>
              <span className="hide-sm">· indicators <span className="num">{fmtMarketTime(rt.freshness.indicatorCalcMs, tz) ?? "—"}</span></span>
              <span className="hide-sm">· decision <span className="num">{fmtMarketTime(rt.freshness.decisionCalcMs, tz) ?? "—"}</span></span>
              <span className="hide-sm">· candle {rt.freshness.formingCandle ? "FORMING" : "CLOSED"}{rt.freshness.lastClosedTsMs ? ` (last ${fmtMarketTime(rt.freshness.lastClosedTsMs, tz, false)})` : ""}</span>
            </div>
          )}

          {/* THE one primary decision strip */}
          <DecisionStrip d={dec.d} plan={plan} evalResult={evalResult} points={points} refreshedAt={dec.refreshedAt} live={global.liveUpdates} onReanalyse={() => void analyze()} monitor={monitorSummary} liveCmp={liveCmp} planGuidance={planGuidance} market={market} />

          {/* Tentative P/L preview for the locked plan. Estimate — decoupled from
              approval; renders as a disabled scenario when entry isn't approved and
              is disabled entirely when the plan is void. */}
          {plan && plan.direction !== "WAIT" && (
            <TentativePnL plan={plan} cmp={liveCmp ?? signal.data.currentPrice} lotSize={sel.lotSize} approved={pnlApproved} planVoid={planVoid} reversalRisk={reversalRisk} notApprovedReason={notApprovedReason} updatedAt={tickMs ?? dec.refreshedAt} />
          )}

          {/* Secondary evidence — tabbed; only the active tab renders */}
          <EvidenceTabs d={dec.d} plan={plan} evalResult={evalResult} signal={signal.data} vix={vixTick.fresh && vixTick.tick ? vixTick.tick.ltp : vix} onReanalyse={() => void analyze()} />
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

