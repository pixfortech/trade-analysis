"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SidebarMode = "expanded" | "collapsed" | "hidden";

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
}

const LIVE_KEY = "global.liveUpdates.v1";
const ALERTS_KEY = "global.alerts.v1";
const SIDEBAR_KEY = "global.sidebarMode.v1";

const Ctx = createContext<GlobalControls | null>(null);

/** Fire window resize so react-grid-layout's WidthProvider remeasures after a
 *  layout change (sidebar toggle). A few staggered events cover the CSS
 *  transition. */
function pokeResize() {
  if (typeof window === "undefined") return;
  [0, 60, 200, 360].forEach((ms) => window.setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
}

/**
 * App-wide live-monitoring + browser-alert preferences. Persisted in
 * localStorage. Live updates default ON; alerts follow the saved preference and
 * the actual Notification permission. Read-only — controls polling/notify only.
 */
export function GlobalControlsProvider({ children }: { children: React.ReactNode }) {
  const [liveUpdates, setLiveUpdatesState] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [browserGranted, setBrowserGranted] = useState(false);
  const [sidebarMode, setSidebarModeState] = useState<SidebarMode>("expanded");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Hydrate from storage + current permission.
  useEffect(() => {
    try {
      const live = window.localStorage.getItem(LIVE_KEY);
      if (live != null) setLiveUpdatesState(live === "true");
      const al = window.localStorage.getItem(ALERTS_KEY);
      if (al != null) setAlertsEnabled(al === "true");
      const sb = window.localStorage.getItem(SIDEBAR_KEY);
      if (sb === "expanded" || sb === "collapsed" || sb === "hidden") setSidebarModeState(sb);
    } catch {
      /* ignore */
    }
    if (typeof Notification !== "undefined") {
      setBrowserGranted(Notification.permission === "granted");
      // If the user previously enabled alerts and permission is already granted,
      // keep it enabled (no re-prompt needed).
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
    };
  }
  return ctx;
}
