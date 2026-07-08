"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { subscribeKiteConnected } from "@/lib/kiteAuth";

// Bounded status poll started when the user clicks Connect. It is a FALLBACK for
// when cross-tab signalling can't reach us (BroadcastChannel unsupported, popup
// blocked, storage disabled). It stops as soon as the session is authenticated.
const POLL_INTERVAL_MS = 2000;
const POLL_WINDOW_MS = 60_000;

/**
 * Kite connect + auto-refresh. Opens Zerodha's hosted login (read-only) and, via
 * three layers — BroadcastChannel, `storage`, and a bounded status poll —
 * refreshes the caller's Kite status the moment the login succeeds, with no
 * manual page reload. `refresh` is the caller's own status re-fetch.
 */
export function useKiteConnect(refresh: () => void) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const stopPollRef = useRef<() => void>(() => {});

  const stopPoll = useCallback(() => {
    stopPollRef.current();
    stopPollRef.current = () => {};
  }, []);

  // Cross-tab success (from the /kite/connected page in the login tab).
  useEffect(() => {
    const unsub = subscribeKiteConnected(() => {
      refreshRef.current();
      stopPoll();
    });
    return () => {
      unsub();
      stopPoll();
    };
  }, [stopPoll]);

  const startPoll = useCallback(() => {
    stopPoll(); // never run two polls at once
    const started = Date.now();
    const id = window.setInterval(async () => {
      if (Date.now() - started > POLL_WINDOW_MS) {
        stopPoll();
        return;
      }
      try {
        const s = await api.kite.status();
        if (s.liveDataEnabled && s.configured && s.authenticated) {
          refreshRef.current();
          stopPoll();
        }
      } catch {
        /* transient — keep polling within the window */
      }
    }, POLL_INTERVAL_MS);
    stopPollRef.current = () => window.clearInterval(id);
  }, [stopPoll]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await api.kite.loginUrl();
      const url = res?.loginUrl;
      if (!url) throw new Error("Login URL unavailable. Is Kite configured on the backend?");
      // Open Zerodha's hosted login in a new tab. We intentionally keep the
      // opener (no `noopener`) so the callback tab can reliably close itself
      // after success (standard hosted-login pattern; the opened origins are
      // Zerodha + our own app). If the browser blocks the popup, fall back to
      // navigating the current tab so login still proceeds.
      const opened = window.open(url, "kite-login");
      if (!opened) {
        window.location.assign(url);
        return;
      }
      startPoll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Kite login.");
    } finally {
      setConnecting(false);
    }
  }, [startPoll]);

  return { connect, connecting, error };
}
