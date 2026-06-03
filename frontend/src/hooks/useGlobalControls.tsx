"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SidebarMode = "expanded" | "collapsed" | "hidden";

// Global font scale (Phase 3L). Maps to html.font-* classes in globals.css.
export type FontScale = "compact" | "normal" | "large" | "xl";
export const FONT_SCALES: FontScale[] = ["compact", "normal", "large", "xl"];
export const FONT_SCALE_LABEL: Record<FontScale, string> = {
  compact: "Compact",
  normal: "Normal",
  large: "Large",
  xl: "Extra Large",
};

/** Instrument shared across Live Signal, AI Recommendation and the assistant. */
export interface SharedInstrument {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  displayName: string;
  lotSize: number | null;
}

const DEFAULT_INSTRUMENT: SharedInstrument = { instrument: "NSE:RELIANCE", displayName: "RELIANCE", lotSize: null };

export interface GlobalControls {
  liveUpdates: boolean;
  alertsEnabled: boolean; // user preference (persisted)
  browserGranted: boolean; // actual Notification permission
  setLiveUpdates: (v: boolean) => void;
  toggleLiveUpdates: () => void;
  enableAlerts: () => Promise<void>;
  disableAlerts: () => void;
  // Sidebar (desktop expanded/collapsed/hidden + mobile drawer)
  sidebarMode: SidebarMode;
  setSidebarMode: (m: SidebarMode) => void;
  cycleSidebar: () => void;
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (v: boolean) => void;
  // Global font size (Phase 3L)
  fontScale: FontScale;
  setFontScale: (s: FontScale) => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  // Shared selected instrument (Phase 3L)
  selectedInstrument: SharedInstrument;
  setSelectedInstrument: (ins: SharedInstrument) => void;
}

const LIVE_KEY = "global.liveUpdates.v1";
const ALERTS_KEY = "global.alerts.v1";
const SIDEBAR_KEY = "global.sidebarMode.v1";
const FONT_KEY = "trade-ui.font-size.v1";
const INSTRUMENT_KEY = "trade-ui.selected-instrument.v1";

const Ctx = createContext<GlobalControls | null>(null);

/** Fire window resize so react-grid-layout's WidthProvider remeasures after a
 *  layout change (sidebar toggle, font-size change). A few staggered events
 *  cover the CSS transition / reflow. */
function pokeResize() {
  if (typeof window === "undefined") return;
  [0, 60, 200, 360].forEach((ms) => window.setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
}

/** Apply the font scale as a class on <html> so the CSS variable resolves. */
function applyFontClass(scale: FontScale) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  for (const s of FONT_SCALES) el.classList.remove(`font-${s}`);
  el.classList.add(`font-${scale}`);
}

/**
 * App-wide live-monitoring, alerts, sidebar, font-size and shared-instrument
 * state. Persisted in localStorage. Live updates default ON; alerts follow the
 * saved preference and the actual Notification permission. Read-only — controls
 * polling/notify/UI only, never any trade action.
 */
export function GlobalControlsProvider({ children }: { children: React.ReactNode }) {
  const [liveUpdates, setLiveUpdatesState] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [browserGranted, setBrowserGranted] = useState(false);
  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>("expanded");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [fontScale, setFontScaleState] = useState<FontScale>("normal");
  const [selectedInstrument, setSelectedInstrumentState] = useState<SharedInstrument>(DEFAULT_INSTRUMENT);

  // Hydrate from storage + current permission.
  useEffect(() => {
    try {
      const live = window.localStorage.getItem(LIVE_KEY);
      if (live != null) setLiveUpdatesState(live === "true");
      const al = window.localStorage.getItem(ALERTS_KEY);
      if (al != null) setAlertsEnabled(al === "true");
      const sb = window.localStorage.getItem(SIDEBAR_KEY);
      if (sb === "expanded" || sb === "collapsed" || sb === "hidden") setSidebarModeState(sb);
      const fs = window.localStorage.getItem(FONT_KEY);
      if (fs === "compact" || fs === "normal" || fs === "large" || fs === "xl") setFontScaleState(fs);
      applyFontClass((fs as FontScale) || "normal");
      const ins = window.localStorage.getItem(INSTRUMENT_KEY);
      if (ins) {
        const parsed = JSON.parse(ins) as Partial<SharedInstrument>;
        if (parsed && typeof parsed.instrument === "string" && parsed.instrument) {
          setSelectedInstrumentState({
            instrument: parsed.instrument,
            displayName: typeof parsed.displayName === "string" && parsed.displayName ? parsed.displayName : parsed.instrument,
            lotSize: typeof parsed.lotSize === "number" ? parsed.lotSize : null,
          });
        }
      }
    } catch {
      /* ignore */
    }
    if (typeof Notification !== "undefined") {
      setBrowserGranted(Notification.permission === "granted");
      if (Notification.permission === "granted") {
        try {
          if (window.localStorage.getItem(ALERTS_KEY) == null) setAlertsEnabled(false);
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  const persist = (key: string, v: boolean) => {
    try {
      window.localStorage.setItem(key, String(v));
    } catch {
      /* ignore */
    }
  };

  const setLiveUpdates = useCallback((v: boolean) => {
    setLiveUpdatesState(v);
    persist(LIVE_KEY, v);
  }, []);
  const toggleLiveUpdates = useCallback(() => setLiveUpdates(!liveUpdates), [liveUpdates, setLiveUpdates]);

  const enableAlerts = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    const granted = perm === "granted";
    setBrowserGranted(granted);
    setAlertsEnabled(granted);
    persist(ALERTS_KEY, granted);
  }, []);

  const disableAlerts = useCallback(() => {
    setAlertsEnabled(false);
    persist(ALERTS_KEY, false);
  }, []);

  const setSidebarMode = useCallback((m: SidebarMode) => {
    setSidebarModeState(m);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, m);
    } catch {
      /* ignore */
    }
    pokeResize(); // grid must remeasure when the sidebar width changes
  }, []);
  // expanded → collapsed → hidden → expanded
  const cycleSidebar = useCallback(() => {
    setSidebarMode(sidebarMode === "expanded" ? "collapsed" : sidebarMode === "collapsed" ? "hidden" : "expanded");
  }, [sidebarMode, setSidebarMode]);

  const setFontScale = useCallback((s: FontScale) => {
    setFontScaleState(s);
    applyFontClass(s);
    try {
      window.localStorage.setItem(FONT_KEY, s);
    } catch {
      /* ignore */
    }
    pokeResize(); // cards must re-fit when text/spacing scale changes
  }, []);
  const increaseFont = useCallback(() => {
    const i = FONT_SCALES.indexOf(fontScale);
    setFontScale(FONT_SCALES[Math.min(i + 1, FONT_SCALES.length - 1)]);
  }, [fontScale, setFontScale]);
  const decreaseFont = useCallback(() => {
    const i = FONT_SCALES.indexOf(fontScale);
    setFontScale(FONT_SCALES[Math.max(i - 1, 0)]);
  }, [fontScale, setFontScale]);
  const resetFont = useCallback(() => setFontScale("normal"), [setFontScale]);

  const setSelectedInstrument = useCallback((ins: SharedInstrument) => {
    setSelectedInstrumentState(ins);
    try {
      window.localStorage.setItem(INSTRUMENT_KEY, JSON.stringify(ins));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        liveUpdates,
        alertsEnabled,
        browserGranted,
        setLiveUpdates,
        toggleLiveUpdates,
        enableAlerts,
        disableAlerts,
        sidebarMode,
        setSidebarMode,
        cycleSidebar,
        mobileDrawerOpen,
        setMobileDrawerOpen,
        fontScale,
        setFontScale,
        increaseFont,
        decreaseFont,
        resetFont,
        selectedInstrument,
        setSelectedInstrument,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useGlobalControls(): GlobalControls {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback (e.g. component rendered outside the provider in tests).
    return {
      liveUpdates: false,
      alertsEnabled: false,
      browserGranted: false,
      setLiveUpdates: () => {},
      toggleLiveUpdates: () => {},
      enableAlerts: async () => {},
      disableAlerts: () => {},
      sidebarMode: "expanded",
      setSidebarMode: () => {},
      cycleSidebar: () => {},
      mobileDrawerOpen: false,
      setMobileDrawerOpen: () => {},
      fontScale: "normal",
      setFontScale: () => {},
      increaseFont: () => {},
      decreaseFont: () => {},
      resetFont: () => {},
      selectedInstrument: DEFAULT_INSTRUMENT,
      setSelectedInstrument: () => {},
    };
  }
  return ctx;
}
