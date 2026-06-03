"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface GlobalControls {
  liveUpdates: boolean;
  alertsEnabled: boolean; // user preference (persisted)
  browserGranted: boolean; // actual Notification permission
  setLiveUpdates: (v: boolean) => void;
  toggleLiveUpdates: () => void;
  enableAlerts: () => Promise<void>;
  disableAlerts: () => void;
}

const LIVE_KEY = "global.liveUpdates.v1";
const ALERTS_KEY = "global.alerts.v1";

const Ctx = createContext<GlobalControls | null>(null);

/**
 * App-wide live-monitoring + browser-alert preferences. Persisted in
 * localStorage. Live updates default ON; alerts follow the saved preference and
 * the actual Notification permission. Read-only — controls polling/notify only.
 */
export function GlobalControlsProvider({ children }: { children: React.ReactNode }) {
  const [liveUpdates, setLiveUpdatesState] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [browserGranted, setBrowserGranted] = useState(false);

  // Hydrate from storage + current permission.
  useEffect(() => {
    try {
      const live = window.localStorage.getItem(LIVE_KEY);
      if (live != null) setLiveUpdatesState(live === "true");
      const al = window.localStorage.getItem(ALERTS_KEY);
      if (al != null) setAlertsEnabled(al === "true");
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

  return (
    <Ctx.Provider
      value={{ liveUpdates, alertsEnabled, browserGranted, setLiveUpdates, toggleLiveUpdates, enableAlerts, disableAlerts }}
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
    };
  }
  return ctx;
}
