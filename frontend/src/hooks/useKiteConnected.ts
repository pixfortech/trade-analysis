"use client";

import { useEffect, useRef } from "react";
import { KITE_CONNECTED_EVENT, emitKiteConnected, subscribeKiteConnected } from "@/lib/kiteAuth";

/**
 * Subscribe a Kite-dependent module to the app-level `kite:connected` event.
 * When Kite authorises (from ANY source — the login tab, a poll, another tab),
 * `onConnected` runs so the module can clear stale "login required" errors and
 * refetch live data with no manual reload. The callback identity may change
 * every render; a ref keeps the listener stable.
 */
export function useKiteConnected(onConnected: () => void): void {
  const ref = useRef(onConnected);
  ref.current = onConnected;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(KITE_CONNECTED_EVENT, handler);
    return () => window.removeEventListener(KITE_CONNECTED_EVENT, handler);
  }, []);
}

/**
 * Mount ONCE at the app root. Bridges cross-tab signals (BroadcastChannel +
 * storage + recent-flag-on-mount) into the single in-tab `kite:connected` event
 * that every module listens to via useKiteConnected(). Kept in one place so we
 * don't open N BroadcastChannels across many components.
 */
export function useKiteConnectedBridge(): void {
  useEffect(() => subscribeKiteConnected(() => emitKiteConnected()), []);
}
