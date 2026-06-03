"use client";

// AI Trade Assistant multi-scrip watchlist (Phase 3M).
// A dedicated list of instruments the assistant tracks/analyses — SEPARATE from
// the Paper Trade and Manual Trade Tracker watchlists. Persisted under its own
// key. Each entry is a real Kite instrument selected via backend search.

import { useCallback, useEffect, useState } from "react";

export interface WatchScrip {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  displayName: string;
  lotSize: number | null;
  exchange?: string;
  instrumentType?: string;
}

const KEY = "ai-assistant.watchlist.v1";
export const MAX_WATCH = 8;

function load(): WatchScrip[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.instrument === "string" && x.instrument)
      .map((x) => ({
        instrument: x.instrument,
        displayName: typeof x.displayName === "string" && x.displayName ? x.displayName : x.instrument,
        lotSize: typeof x.lotSize === "number" ? x.lotSize : null,
        exchange: typeof x.exchange === "string" ? x.exchange : undefined,
        instrumentType: typeof x.instrumentType === "string" ? x.instrumentType : undefined,
      }))
      .slice(0, MAX_WATCH);
  } catch {
    return [];
  }
}

/** React state for the assistant's tracked-scrip list (localStorage-backed). */
export function useAiWatchlist() {
  const [list, setList] = useState<WatchScrip[]>([]);

  useEffect(() => {
    setList(load());
  }, []);

  const save = useCallback((next: WatchScrip[]) => {
    setList(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const add = useCallback(
    (s: WatchScrip) => {
      setList((cur) => {
        if (cur.some((x) => x.instrument === s.instrument)) return cur;
        const next = [...cur, s].slice(0, MAX_WATCH);
        try {
          window.localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [],
  );

  const remove = useCallback((instrument: string) => {
    setList((cur) => {
      const next = cur.filter((x) => x.instrument !== instrument);
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const has = useCallback((instrument: string) => list.some((x) => x.instrument === instrument), [list]);

  return { list, add, remove, has, save, full: list.length >= MAX_WATCH };
}
