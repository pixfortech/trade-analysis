"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AlertSeverity = "info" | "caution" | "urgent";
export interface AlertItem {
  id: string;
  title: string;
  body: string;
  severity: AlertSeverity;
  at: number;
}

const COOLDOWN_MS = 20_000; // avoid spam: same key at most every 20s

/**
 * In-app alert history + toast queue, with optional browser notifications.
 * Advisory only — alerts never trigger any trade action.
 */
export function useAlerts() {
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [toasts, setToasts] = useState<AlertItem[]>([]);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const lastFired = useRef<Record<string, number>>({});

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setBrowserEnabled(true);
  }, []);

  const requestBrowser = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setBrowserEnabled(perm === "granted");
  }, []);

  /** Fire an alert. `key` de-duplicates within the cooldown window. */
  const push = useCallback(
    (key: string, title: string, body: string, severity: AlertSeverity) => {
      const now = Date.now();
      if (lastFired.current[key] && now - lastFired.current[key] < COOLDOWN_MS) return;
      lastFired.current[key] = now;

      const item: AlertItem = { id: `${key}-${now}`, title, body, severity, at: now };
      setHistory((h) => [item, ...h].slice(0, 50));
      setToasts((t) => [item, ...t].slice(0, 4));
      // auto-dismiss toast
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== item.id)), severity === "urgent" ? 12000 : 7000);

      if (browserEnabled && (severity === "urgent" || severity === "caution") && typeof Notification !== "undefined") {
        try {
          new Notification(title, { body });
        } catch {
          /* ignore */
        }
      }
    },
    [browserEnabled],
  );

  const dismiss = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const clearHistory = useCallback(() => setHistory([]), []);

  return { history, toasts, push, dismiss, clearHistory, browserEnabled, requestBrowser };
}
