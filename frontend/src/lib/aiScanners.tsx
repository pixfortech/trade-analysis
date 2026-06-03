"use client";

// Multi-instance AI Trade Scanner store (Phase 3N).
// A small React context so the Watchlist "Analyse" button and the scanner dock
// share state. SEPARATE from the AI Assistant watchlist and AI Virtual Trades.
// Persisted under its own key. Opening from the Watchlist ADDS a scanner (or
// focuses an existing one) — it never replaces the current one.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface ScannerInstrument {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  displayName: string;
  exchange: string;
}

export type ScannerState = "expanded" | "minimised";

export interface Scanner {
  id: string;
  instrument: ScannerInstrument;
  state: ScannerState;
  pinned: boolean;
  createdAt: number;
  lastViewedAt: number;
}

export interface AiScannersApi {
  scanners: Scanner[];
  open: (ins: ScannerInstrument) => void;
  minimise: (id: string) => void;
  expand: (id: string) => void;
  togglePin: (id: string) => void;
  close: (id: string) => void;
  closeAllUnpinned: () => void;
  has: (instrument: string) => boolean;
}

const KEY = "ai-trade-scanners.v1";
const MAX_SCANNERS = 12;

const Ctx = createContext<AiScannersApi | null>(null);

/** Fire staggered resize so react-grid-layout re-measures after dock changes. */
function pokeResize() {
  if (typeof window === "undefined") return;
  [0, 80, 240].forEach((ms) => window.setTimeout(() => window.dispatchEvent(new Event("resize")), ms));
}

function load(): Scanner[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.id === "string" && s.instrument && typeof s.instrument.instrument === "string")
      .map((s) => ({
        id: s.id,
        instrument: {
          instrument: s.instrument.instrument,
          displayName: typeof s.instrument.displayName === "string" ? s.instrument.displayName : s.instrument.instrument,
          exchange: typeof s.instrument.exchange === "string" ? s.instrument.exchange : "",
        },
        state: (s.state === "minimised" ? "minimised" : "expanded") as ScannerState,
        pinned: Boolean(s.pinned),
        createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
        lastViewedAt: typeof s.lastViewedAt === "number" ? s.lastViewedAt : Date.now(),
      }))
      .slice(0, MAX_SCANNERS);
  } catch {
    return [];
  }
}

function uid(sym: string): string {
  return `scanner_${sym.replace(/[^A-Za-z0-9]/g, "")}_${Date.now().toString(36)}`;
}

export function AiScannersProvider({ children }: { children: React.ReactNode }) {
  const [scanners, setScanners] = useState<Scanner[]>([]);

  useEffect(() => {
    setScanners(load());
  }, []);

  const open = useCallback(
    (ins: ScannerInstrument) => {
      setScanners((cur) => {
        const now = Date.now();
        const existing = cur.find((s) => s.instrument.instrument === ins.instrument);
        let next: Scanner[];
        if (existing) {
          // Focus the existing scanner (expand + bring forward) — no duplicate.
          next = cur.map((s) => (s.id === existing.id ? { ...s, state: "expanded", lastViewedAt: now } : s));
        } else {
          const scanner: Scanner = { id: uid(ins.displayName || ins.instrument), instrument: ins, state: "expanded", pinned: false, createdAt: now, lastViewedAt: now };
          next = [...cur, scanner].slice(-MAX_SCANNERS);
        }
        try {
          window.localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      pokeResize();
    },
    [],
  );

  const patch = useCallback(
    (id: string, p: Partial<Scanner>) => {
      setScanners((cur) => {
        const next = cur.map((s) => (s.id === id ? { ...s, ...p, lastViewedAt: Date.now() } : s));
        try {
          window.localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      pokeResize();
    },
    [],
  );

  const minimise = useCallback((id: string) => patch(id, { state: "minimised" }), [patch]);
  const expand = useCallback((id: string) => patch(id, { state: "expanded" }), [patch]);
  const togglePin = useCallback(
    (id: string) => setScanners((cur) => {
      const next = cur.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s));
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    }),
    [],
  );
  const close = useCallback((id: string) => { setScanners((cur) => { const next = cur.filter((s) => s.id !== id); try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; }); pokeResize(); }, []);
  const closeAllUnpinned = useCallback(() => { setScanners((cur) => { const next = cur.filter((s) => s.pinned); try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; }); pokeResize(); }, []);
  const has = useCallback((instrument: string) => scanners.some((s) => s.instrument.instrument === instrument), [scanners]);

  return <Ctx.Provider value={{ scanners, open, minimise, expand, togglePin, close, closeAllUnpinned, has }}>{children}</Ctx.Provider>;
}

export function useAiScanners(): AiScannersApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      scanners: [],
      open: () => {},
      minimise: () => {},
      expand: () => {},
      togglePin: () => {},
      close: () => {},
      closeAllUnpinned: () => {},
      has: () => false,
    };
  }
  return ctx;
}
