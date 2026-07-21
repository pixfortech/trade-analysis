"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getBackendBaseUrl } from "@/lib/apiClient";
import { usePublicConfig } from "@/hooks/usePublicConfig";

// =====================================================================
// Tick-stream client — a single SSE connection to the backend Kite→SSE relay
// (GET /api/stream/ticks). It multiplexes EVERY instrument any component needs
// via ref-counted keys, so there is one connection for the whole cockpit. The
// browser EventSource reconnects on its own; the backend owns the upstream Kite
// reconnect/resubscribe. Prices only cross the wire — never a Kite token.
//
// Real-time: tick events update an in-memory map and bump a version at most once
// per animation frame (coalescing bursts), so CMP / points-to-entry re-render
// immediately on each tick instead of on a 5-second poll. When the stream is not
// LIVE — disabled, connecting, degraded — components fall back to REST polling.
// Freshness uses the CLIENT receipt instant (skew-safe), not the server clock.
// =====================================================================

export type StreamClientState = "LIVE" | "CONNECTING" | "DEGRADED" | "DISCONNECTED" | "DISABLED" | "IDLE";

export interface TickData {
  key: string;
  token: number;
  ltp: number;
  isIndex: boolean;
  mode: string;
  tsMs: number; // best source instant (exchange ts if present, else server receipt)
  exchangeTsMs: number | null;
  receivedMs: number; // server receipt instant
  ohlc: { open: number; high: number; low: number; close: number } | null;
  change: number | null;
  volume: number | null;
  oi: number | null;
  source: "ws";
  clientMs: number; // when THIS browser received it — the freshness clock
}

interface TickStreamCtx {
  wsEnabled: boolean;
  state: StreamClientState;
  message: string;
  lastTickMs: number | null; // newest client-receipt across all ticks
  subscribe: (keys: string[]) => () => void;
  getTick: (key: string) => TickData | undefined;
}

const Ctx = createContext<TickStreamCtx | null>(null);

export function TickStreamProvider({ children }: { children: React.ReactNode }) {
  const cfg = usePublicConfig();
  const wsEnabled = cfg.stream.wsEnabled;

  const countsRef = useRef<Map<string, number>>(new Map());
  const ticksRef = useRef<Map<string, TickData>>(new Map());
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [keysStr, setKeysStr] = useState("");
  const [, setVersion] = useState(0);
  const [state, setState] = useState<StreamClientState>("IDLE");
  const [message, setMessage] = useState("");

  const recompute = useCallback(() => {
    setKeysStr(Array.from(countsRef.current.keys()).sort().join(","));
  }, []);

  const scheduleBump = useCallback(() => {
    if (rafRef.current != null || typeof window === "undefined") return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      setVersion((v) => (v + 1) % 1_000_000);
    });
  }, []);

  const subscribe = useCallback(
    (keys: string[]) => {
      const clean = keys.filter((k) => k && k.includes(":"));
      for (const k of clean) countsRef.current.set(k, (countsRef.current.get(k) ?? 0) + 1);
      recompute();
      return () => {
        for (const k of clean) {
          const n = countsRef.current.get(k);
          if (n == null) continue;
          if (n <= 1) countsRef.current.delete(k);
          else countsRef.current.set(k, n - 1);
        }
        recompute();
      };
    },
    [recompute],
  );

  // One EventSource for the union of desired keys; reopens when the set changes.
  useEffect(() => {
    if (!wsEnabled) {
      setState("DISABLED");
      setMessage("Streaming disabled — REST polling.");
      return;
    }
    if (!keysStr) {
      setState("IDLE");
      return;
    }
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const url = `${getBackendBaseUrl()}/api/stream/ticks?instruments=${encodeURIComponent(keysStr)}`;
    const es = new EventSource(url);
    setState("CONNECTING");

    es.addEventListener("status", (e) => {
      try {
        const s = JSON.parse((e as MessageEvent).data) as { state: StreamClientState; message: string };
        setState(s.state);
        setMessage(s.message ?? "");
      } catch {
        /* ignore malformed status */
      }
    });
    es.addEventListener("tick", (e) => {
      try {
        const t = JSON.parse((e as MessageEvent).data) as TickData;
        const clientMs = Date.now();
        ticksRef.current.set(t.key, { ...t, clientMs });
        lastTickRef.current = clientMs;
        scheduleBump();
      } catch {
        /* ignore malformed tick */
      }
    });
    es.onerror = () => {
      // EventSource auto-reconnects; reflect the interruption (REST takes over).
      setState((prev) => (prev === "LIVE" || prev === "CONNECTING" ? "DEGRADED" : prev));
    };

    return () => {
      es.close();
    };
  }, [wsEnabled, keysStr, scheduleBump]);

  const value: TickStreamCtx = {
    wsEnabled,
    state,
    message,
    lastTickMs: lastTickRef.current,
    subscribe,
    getTick: (key: string) => ticksRef.current.get(key),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useTickStreamCtx(): TickStreamCtx {
  return (
    useContext(Ctx) ?? {
      wsEnabled: false,
      state: "DISABLED",
      message: "",
      lastTickMs: null,
      subscribe: () => () => {},
      getTick: () => undefined,
    }
  );
}

/** Whole-stream status (state + last tick instant) for the monitoring UI. */
export function useTickStreamStatus(): { state: StreamClientState; message: string; lastTickMs: number | null; live: boolean } {
  const { state, message, lastTickMs } = useTickStreamCtx();
  return { state, message, lastTickMs, live: state === "LIVE" };
}

/**
 * Subscribe to one instrument's live tick. Returns the latest tick (or undefined)
 * and whether it is FRESH (received within the configured tick-stale window).
 * Falls back cleanly (fresh=false) when the stream isn't delivering.
 */
export function useInstrumentTick(key: string | null): { tick: TickData | undefined; fresh: boolean; live: boolean } {
  const cfg = usePublicConfig();
  const ctx = useTickStreamCtx();
  useEffect(() => {
    if (!key) return;
    return ctx.subscribe([key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const tick = key ? ctx.getTick(key) : undefined;
  const fresh = !!tick && Date.now() - tick.clientMs <= cfg.stream.tickStaleMs;
  return { tick, fresh, live: ctx.state === "LIVE" };
}

/** Subscribe to several instruments at once (e.g. the indices strip). */
export function useInstrumentTicks(keys: string[]): { getTick: (key: string) => TickData | undefined; live: boolean; state: StreamClientState } {
  const ctx = useTickStreamCtx();
  const keysStr = keys.filter(Boolean).join(",");
  useEffect(() => {
    const arr = keysStr ? keysStr.split(",") : [];
    if (arr.length === 0) return;
    return ctx.subscribe(arr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysStr]);
  return { getTick: ctx.getTick, live: ctx.state === "LIVE", state: ctx.state };
}
