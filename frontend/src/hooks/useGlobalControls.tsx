"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SidebarMode = "expanded" | "collapsed" | "hidden";

// Layout density (Phase 3Q). Compact is the default — tighter card padding and
// layout gaps for a fast, professional cockpit. Applied as data-density on
// <html>; globals.css overrides the spacing tokens for compact.
export type Density = "compact" | "comfortable";
export const DENSITY_DEFAULT: Density = "compact";

// Global numeric font size (Phase 3M). Stored as a pixel value and applied as an
// inline CSS custom property on <html> (globals.css consumes --app-base-font-size).
export const FONT_MIN = 13;
export const FONT_MAX = 20;
export const FONT_DEFAULT = 16;

export function clampFont(px: number): number {
  if (!Number.isFinite(px)) return FONT_DEFAULT;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(px)));
}

/** Instrument shared across Live Signal, AI Recommendation and the assistant. */
export interface SharedInstrument {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  displayName: string;
  lotSize: number | null;
  /** False for reference-only instruments Kite can't quote (e.g. NSEIX/GIFT). */
  quotable: boolean;
  /** Underlying name — used to resolve a nearest tradable future. */
  name?: string;
}

// Exchanges Kite can actually quote/serve. Reference-only instruments (e.g.
// NSEIX / GIFT NIFTY) stay VISIBLE and selectable, just marked not quotable.
const QUOTABLE_EXCHANGES = new Set(["NSE", "BSE", "NFO", "BFO", "CDS", "BCD", "MCX", "INDICES"]);

export function exchangeOfKey(key: string): string {
  const i = key.indexOf(":");
  return i > 0 ? key.slice(0, i).toUpperCase() : "";
}
/** Kite can quote/serve this instrument key directly (else reference-only). */
export function isQuotableKey(key: string): boolean {
  return QUOTABLE_EXCHANGES.has(exchangeOfKey(key));
}
/** A usable EXCHANGE:SYMBOL key (format only — reference instruments are kept). */
function isWellFormedKey(key: string): boolean {
  const i = key.indexOf(":");
  return i > 0 && i < key.length - 1;
}

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
  // Global font size in px (Phase 3M)
  fontSizePx: number;
  setFontSizePx: (px: number) => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  // Layout density (Phase 3Q) — compact (default) or comfortable.
  density: Density;
  setDensity: (d: Density) => void;
  // Shared selected instrument (Phase 3L) — null until the user picks one.
  selectedInstrument: SharedInstrument | null;
  setSelectedInstrument: (ins: SharedInstrument | null) => void;
}

const LIVE_KEY = "global.liveUpdates.v1";
const ALERTS_KEY = "global.alerts.v1";
const SIDEBAR_KEY = "global.sidebarMode.v1";
const FONT_KEY = "trade-ui.font-size-px.v1";
const FONT_KEY_LEGACY = "trade-ui.font-size.v1"; // old preset names — migrated once
const INSTRUMENT_KEY = "trade-ui.selected-instrument.v1";
const DENSITY_KEY = "cockpit.density.v1";

const Ctx = createContext<GlobalControls | null>(null);

/** Fire window resize so react-grid-layout's WidthProvider remeasures after a
 *  layout change (sidebar toggle, font-size change). A few staggered events
 *  cover the CSS transition / reflow. */
function pokeResize() {
  if (typeof window === "undefined") return;
  [0, 60, 200, 360].forEach((ms) => window.setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
}

/** Apply the numeric font size as an inline custom property on <html>. */
function applyFontSize(px: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--app-base-font-size", `${px}px`);
}

/** Apply layout density as a data attribute on <html> (globals.css reacts). */
function applyDensity(d: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-density", d);
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
  const [fontSizePx, setFontSizePxState] = useState<number>(FONT_DEFAULT);
  const [density, setDensityState] = useState<Density>(DENSITY_DEFAULT);
  const [selectedInstrument, setSelectedInstrumentState] = useState<SharedInstrument | null>(null);

  // Hydrate from storage + current permission.
  useEffect(() => {
    try {
      const live = window.localStorage.getItem(LIVE_KEY);
      if (live != null) setLiveUpdatesState(live === "true");
      const al = window.localStorage.getItem(ALERTS_KEY);
      if (al != null) setAlertsEnabled(al === "true");
      const sb = window.localStorage.getItem(SIDEBAR_KEY);
      if (sb === "expanded" || sb === "collapsed" || sb === "hidden") setSidebarModeState(sb);
      let px = FONT_DEFAULT;
      const fs = window.localStorage.getItem(FONT_KEY);
      if (fs != null && Number.isFinite(Number(fs))) {
        px = clampFont(Number(fs));
      } else {
        const legacy = window.localStorage.getItem(FONT_KEY_LEGACY); // migrate old presets
        if (legacy) px = legacy === "compact" ? 14 : legacy === "large" ? 18 : legacy === "xl" ? 20 : 16;
      }
      setFontSizePxState(px);
      applyFontSize(px);
      const dens = window.localStorage.getItem(DENSITY_KEY);
      const d: Density = dens === "comfortable" ? "comfortable" : "compact";
      setDensityState(d);
      applyDensity(d);
      const ins = window.localStorage.getItem(INSTRUMENT_KEY);
      if (ins) {
        const parsed = JSON.parse(ins) as Partial<SharedInstrument>;
        // Restore a previous selection if the key is well-formed (reference-only
        // instruments like GIFT NIFTY are KEPT, just flagged not quotable). No
        // auto-default on a fresh profile.
        if (parsed && typeof parsed.instrument === "string" && isWellFormedKey(parsed.instrument)) {
          setSelectedInstrumentState({
            instrument: parsed.instrument,
            displayName: typeof parsed.displayName === "string" && parsed.displayName ? parsed.displayName : parsed.instrument,
            lotSize: typeof parsed.lotSize === "number" ? parsed.lotSize : null,
            quotable: typeof parsed.quotable === "boolean" ? parsed.quotable : isQuotableKey(parsed.instrument),
            name: typeof parsed.name === "string" ? parsed.name : undefined,
          });
        } else {
          window.localStorage.removeItem(INSTRUMENT_KEY);
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

  const setFontSizePx = useCallback((px: number) => {
    const v = clampFont(px);
    setFontSizePxState(v);
    applyFontSize(v);
    try {
      window.localStorage.setItem(FONT_KEY, String(v));
    } catch {
      /* ignore */
    }
    pokeResize(); // cards must re-fit when text/spacing scale changes
  }, []);
  const increaseFont = useCallback(() => setFontSizePx(fontSizePx + 1), [fontSizePx, setFontSizePx]);
  const decreaseFont = useCallback(() => setFontSizePx(fontSizePx - 1), [fontSizePx, setFontSizePx]);
  const resetFont = useCallback(() => setFontSizePx(FONT_DEFAULT), [setFontSizePx]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    applyDensity(d);
    try {
      window.localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* ignore */
    }
    pokeResize(); // grid must remeasure when spacing changes
  }, []);

  const setSelectedInstrument = useCallback((ins: SharedInstrument | null) => {
    setSelectedInstrumentState(ins);
    try {
      if (ins) window.localStorage.setItem(INSTRUMENT_KEY, JSON.stringify(ins));
      else window.localStorage.removeItem(INSTRUMENT_KEY);
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
        fontSizePx,
        setFontSizePx,
        increaseFont,
        decreaseFont,
        resetFont,
        density,
        setDensity,
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
      fontSizePx: FONT_DEFAULT,
      setFontSizePx: () => {},
      increaseFont: () => {},
      decreaseFont: () => {},
      resetFont: () => {},
      density: DENSITY_DEFAULT,
      setDensity: () => {},
      selectedInstrument: null,
      setSelectedInstrument: () => {},
    };
  }
  return ctx;
}
