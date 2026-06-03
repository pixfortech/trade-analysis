"use client";

// Multi-instance AI Trade Scanner store (Phase 3N).
// A small React context so the Watchlist "Analyse" button and the scanner dock
// share state. SEPARATE from the AI Assistant watchlist and AI Virtual Trades.
// Persisted under its own key. Opening from the Watchlist ADDS a scanner (or
// focuses an existing one) — it never replaces the current one.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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
  focus: (id: string) => void;
  minimise: (id: string) => void;
  expand: (id: string) => void;
  togglePin: (id: string) => void;
  close: (id: string) => void;
  closeAllUnpinned: () => void;
  has: (instrument: string) => boolean;
  /** Bumped whenever a scanner is opened/focused — consumers scroll/highlight. */
  focusNonce: number;
  /** The id to scroll to / highlight for the latest focus request. */
  focusedId: string | null;
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

function persist(next: Scanner[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function AiScannersProvider({ children }: { children: React.ReactNode }) {
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [focus, setFocus] = useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 });
  // Latest scanners for closures that must not go stale.
  const ref = useRef<Scanner[]>([]);
  ref.current = scanners;

  useEffect(() => {
    setScanners(load());
  }, []);

  const commit = useCallback((next: Scanner[]) => {
    setScanners(next);
    persist(next);
  }, []);

  /** Request focus (scroll + highlight) for a scanner. Bumps the nonce so the
   *  same id requested twice still re-triggers consumers. */
  const requestFocus = useCallback((id: string) => setFocus({ id, nonce: Date.now() }), []);

  const open = useCallback(
    (ins: ScannerInstrument) => {
      const now = Date.now();
      const cur = ref.current;
      const existing = cur.find((s) => s.instrument.instrument === ins.instrument);
      const id = existing ? existing.id : uid(ins.displayName || ins.instrument);
      const next = existing
        ? cur.map((s) => (s.id === id ? { ...s, state: "expanded" as ScannerState, lastViewedAt: now } : s))
        : [...cur, { id, instrument: ins, state: "expanded" as ScannerState, pinned: false, createdAt: now, lastViewedAt: now }].slice(-MAX_SCANNERS);
      commit(next);
      requestFocus(id); // visibly open: scroll + highlight handled by consumers
      pokeResize();
    },
    [commit, requestFocus],
  );

  const focusFn = useCallback(
    (id: string) => {
      const next = ref.current.map((s) => (s.id === id ? { ...s, state: "expanded" as ScannerState, lastViewedAt: Date.now() } : s));
      commit(next);
      requestFocus(id);
      pokeResize();
    },
    [commit, requestFocus],
  );

  const minimise = useCallback((id: string) => commit(ref.current.map((s) => (s.id === id ? { ...s, state: "minimised" as ScannerState } : s))), [commit]);
  const expand = useCallback((id: string) => { commit(ref.current.map((s) => (s.id === id ? { ...s, state: "expanded" as ScannerState } : s))); pokeResize(); }, [commit]);
  const togglePin = useCallback((id: string) => commit(ref.current.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s))), [commit]);
  const close = useCallback((id: string) => { commit(ref.current.filter((s) => s.id !== id)); pokeResize(); }, [commit]);
  const closeAllUnpinned = useCallback(() => { commit(ref.current.filter((s) => s.pinned)); pokeResize(); }, [commit]);
  const has = useCallback((instrument: string) => scanners.some((s) => s.instrument.instrument === instrument), [scanners]);

  return (
    <Ctx.Provider value={{ scanners, open, focus: focusFn, minimise, expand, togglePin, close, closeAllUnpinned, has, focusNonce: focus.nonce, focusedId: focus.id }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAiScanners(): AiScannersApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      scanners: [],
      open: () => {},
      focus: () => {},
      minimise: () => {},
      expand: () => {},
      togglePin: () => {},
      close: () => {},
      closeAllUnpinned: () => {},
      has: () => false,
      focusNonce: 0,
      focusedId: null,
    };
  }
  return ctx;
}
