"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { TradePlanSnapshot } from "@/lib/tradePlan";

// =====================================================================
// AnalysisSessionProvider — the DURABLE analysis session.
// ---------------------------------------------------------------------
// ROOT CAUSE fixed here: the analysed instrument, its LOCKED trade plan, the
// timeframe/mode controls and the monitoring baseline used to live as local
// useState inside LiveMarketSignal. Switching cockpit screens unmounts that
// component, so every Analyse result was destroyed on a tab change.
//
// This provider is mounted ABOVE the screen switch (in page.tsx), so its state
// survives unmount/remount. LiveMarketSignal reads/writes here instead of local
// state. A resumable subset (controls + locked plan + baseline, NO secrets/tokens)
// is persisted to localStorage so it also survives a full reload — returning
// restores the plan and resumes monitoring WITHOUT another Analyse.
//
// A locked plan belongs to the (instrument, timeframe, mode) triple it was built
// for. LiveMarketSignal shows it only while the current controls match; changing
// timeframe/mode/instrument therefore stops showing stale locked levels (the old
// "clear on change" behaviour) without needing an on-mount reset that a screen
// switch would wrongly fire.
// =====================================================================

export interface AnalysisSession {
  instrumentKey: string; // EXCHANGE:SYMBOL this session was analysed for
  displayName: string;
  interval: string; // timeframe the plan was locked on
  riskProfile: string; // strategy mode the plan was locked on
  plan: TradePlanSnapshot; // LOCKED levels — never mutated live
  analysedCmp: number; // baseline CMP captured at Analyse
  analysedAt: number | null; // analysis quote/calc time (epoch ms)
  startedAt: number; // monitoring start (epoch ms)
  mfe: number; // max favourable excursion since analysis (ephemeral per page load)
  mae: number; // max adverse excursion since analysis (ephemeral per page load)
  monitoringEnabled: boolean; // user paused monitoring for this session?
}

/** Payload to open a fresh session (on Analyse). */
export interface StartSessionInput {
  instrumentKey: string;
  displayName: string;
  interval: string;
  riskProfile: string;
  plan: TradePlanSnapshot;
  analysedCmp: number;
  analysedAt: number | null;
}

export interface AnalysisSessionCtx {
  hydrated: boolean;
  // Durable controls (survive screen switches AND reloads).
  interval: string;
  riskProfile: string;
  segment: string;
  setInterval: (v: string) => void;
  setRiskProfile: (v: string) => void;
  setSegment: (v: string) => void;
  // The locked analysis session.
  session: AnalysisSession | null;
  startSession: (input: StartSessionInput) => void;
  clearSession: () => void;
  setMonitoringEnabled: (v: boolean) => void;
  /** Update MFE/MAE extremes (in-memory only; not persisted). */
  bumpExcursion: (mfe: number, mae: number) => void;
}

export const DEFAULT_INTERVAL = "5minute";
export const DEFAULT_RISK_PROFILE = "balanced";
export const DEFAULT_SEGMENT = "all";

const CONTROLS_KEY = "cockpit.analysis-controls.v1";
const SESSION_KEY = "cockpit.analysis-session.v1";

const Ctx = createContext<AnalysisSessionCtx | null>(null);

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function removeKey(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Minimal shape guard for a persisted session (defensive against tampering). */
function isValidSession(s: unknown): s is AnalysisSession {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.instrumentKey === "string" &&
    typeof o.interval === "string" &&
    typeof o.riskProfile === "string" &&
    !!o.plan &&
    typeof o.plan === "object" &&
    typeof o.analysedCmp === "number"
  );
}

export function AnalysisSessionProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [interval, setIntervalState] = useState(DEFAULT_INTERVAL);
  const [riskProfile, setRiskProfileState] = useState(DEFAULT_RISK_PROFILE);
  const [segment, setSegmentState] = useState(DEFAULT_SEGMENT);
  const [session, setSession] = useState<AnalysisSession | null>(null);
  // Keep the latest session in a ref so persistence helpers don't need it as a dep.
  const sessionRef = useRef<AnalysisSession | null>(null);
  sessionRef.current = session;

  // Hydrate controls + session from storage once (client only).
  useEffect(() => {
    const controls = readJson<{ interval?: string; riskProfile?: string; segment?: string }>(CONTROLS_KEY);
    if (controls) {
      if (typeof controls.interval === "string") setIntervalState(controls.interval);
      if (typeof controls.riskProfile === "string") setRiskProfileState(controls.riskProfile);
      if (typeof controls.segment === "string") setSegmentState(controls.segment);
    }
    const saved = readJson<AnalysisSession>(SESSION_KEY);
    if (isValidSession(saved)) {
      // MFE/MAE are excursions within a live page session — restart at 0 on reload.
      setSession({ ...saved, mfe: 0, mae: 0, monitoringEnabled: saved.monitoringEnabled !== false });
    }
    setHydrated(true);
  }, []);

  const persistControls = useCallback((next: { interval: string; riskProfile: string; segment: string }) => {
    writeJson(CONTROLS_KEY, next);
  }, []);

  const setInterval = useCallback(
    (v: string) => {
      setIntervalState(v);
      persistControls({ interval: v, riskProfile, segment });
    },
    [persistControls, riskProfile, segment],
  );
  const setRiskProfile = useCallback(
    (v: string) => {
      setRiskProfileState(v);
      persistControls({ interval, riskProfile: v, segment });
    },
    [persistControls, interval, segment],
  );
  const setSegment = useCallback(
    (v: string) => {
      setSegmentState(v);
      persistControls({ interval, riskProfile, segment: v });
    },
    [persistControls, interval, riskProfile],
  );

  const startSession = useCallback((input: StartSessionInput) => {
    const next: AnalysisSession = {
      instrumentKey: input.instrumentKey,
      displayName: input.displayName,
      interval: input.interval,
      riskProfile: input.riskProfile,
      plan: input.plan,
      analysedCmp: input.analysedCmp,
      analysedAt: input.analysedAt,
      startedAt: Date.now(),
      mfe: 0,
      mae: 0,
      monitoringEnabled: true,
    };
    setSession(next);
    writeJson(SESSION_KEY, next);
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    removeKey(SESSION_KEY);
  }, []);

  const setMonitoringEnabled = useCallback((v: boolean) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, monitoringEnabled: v };
      writeJson(SESSION_KEY, next);
      return next;
    });
  }, []);

  // MFE/MAE update in-memory only (no storage write per tick). Only writes state
  // when an extreme actually moved, so ticks that don't set a new high/low are free.
  const bumpExcursion = useCallback((mfe: number, mae: number) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (mfe <= prev.mfe && mae <= prev.mae) return prev;
      return { ...prev, mfe: Math.max(prev.mfe, mfe), mae: Math.max(prev.mae, mae) };
    });
  }, []);

  return (
    <Ctx.Provider
      value={{
        hydrated,
        interval,
        riskProfile,
        segment,
        setInterval,
        setRiskProfile,
        setSegment,
        session,
        startSession,
        clearSession,
        setMonitoringEnabled,
        bumpExcursion,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAnalysisSession(): AnalysisSessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback for components rendered outside the provider (e.g. tests).
    return {
      hydrated: false,
      interval: DEFAULT_INTERVAL,
      riskProfile: DEFAULT_RISK_PROFILE,
      segment: DEFAULT_SEGMENT,
      setInterval: () => {},
      setRiskProfile: () => {},
      setSegment: () => {},
      session: null,
      startSession: () => {},
      clearSession: () => {},
      setMonitoringEnabled: () => {},
      bumpExcursion: () => {},
    };
  }
  return ctx;
}
