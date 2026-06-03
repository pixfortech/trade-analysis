"use client";

// Floating AI Trade Assistant manager (Phase 3O).
// A React context that manages MULTIPLE independent floating assistant windows
// opened from the Watchlist. Each has its own instrument, window position,
// z-index and expanded/minimised/pinned state. SEPARATE from the right-side
// FloatingTradeAssistant (which follows the globally-selected instrument), the
// AI Assistant watchlist and AI Virtual Trades. Persisted in localStorage.
// Opening ADDS a window (or focuses an existing one) — never replaces another.

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
  zIndex: number;
  position: { x: number; y: number };
  createdAt: number;
  lastViewedAt: number;
}

export interface AiScannersApi {
  scanners: Scanner[];
  open: (ins: ScannerInstrument) => void;
  focus: (id: string) => void;
  minimise: (id: string) => void;
  minimiseAll: () => void;
  expand: (id: string) => void;
  togglePin: (id: string) => void;
  close: (id: string) => void;
  closeAllUnpinned: () => void;
  bringToFront: (id: string) => void;
  setPosition: (id: string, x: number, y: number) => void;
  has: (instrument: string) => boolean;
  /** Bumped whenever a window is opened/focused — consumers pulse/scroll. */
  focusNonce: number;
  focusedId: string | null;
}

const KEY = "ai-floating-assistants.v1";
const LEGACY_KEY = "ai-trade-scanners.v1"; // earlier in-grid dock — migrated once
const MAX_SCANNERS = 12;
const Z_BASE = 100;

const Ctx = createContext<AiScannersApi | null>(null);

function persist(next: Scanner[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function maxZ(list: Scanner[]): number {
  return list.reduce((m, s) => Math.max(m, s.zIndex), Z_BASE);
}

function load(): Scanner[] {
  const read = (k: string) => {
    try {
      const raw = window.localStorage.getItem(k);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  };
  const arr = read(KEY) ?? read(LEGACY_KEY);
  if (!arr) return [];
  return arr
    .filter((s) => s && typeof s.id === "string" && s.instrument && typeof s.instrument.instrument === "string")
    .map((s, idx): Scanner => ({
      id: s.id,
      instrument: {
        instrument: s.instrument.instrument,
        displayName: typeof s.instrument.displayName === "string" ? s.instrument.displayName : s.instrument.instrument,
        exchange: typeof s.instrument.exchange === "string" ? s.instrument.exchange : "",
      },
      state: (s.state === "minimised" ? "minimised" : "expanded") as ScannerState,
      pinned: Boolean(s.pinned),
      zIndex: typeof s.zIndex === "number" ? s.zIndex : Z_BASE + idx,
      position: s.position && typeof s.position.x === "number" && typeof s.position.y === "number" ? s.position : defaultPosition(idx),
      createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
      lastViewedAt: typeof s.lastViewedAt === "number" ? s.lastViewedAt : Date.now(),
    }))
    .slice(0, MAX_SCANNERS);
}

function defaultPosition(count: number): { x: number; y: number } {
  return { x: 80 + (count % 5) * 34, y: 96 + (count % 5) * 34 };
}

function uid(sym: string): string {
  return `assistant_${sym.replace(/[^A-Za-z0-9]/g, "")}_${Date.now().toString(36)}`;
}

export function AiScannersProvider({ children }: { children: React.ReactNode }) {
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [focus, setFocus] = useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 });
  const ref = useRef<Scanner[]>([]);
  ref.current = scanners;

  useEffect(() => {
    setScanners(load());
  }, []);

  const commit = useCallback((next: Scanner[]) => {
    setScanners(next);
    persist(next);
  }, []);

  const requestFocus = useCallback((id: string) => setFocus({ id, nonce: Date.now() }), []);

  const open = useCallback(
    (ins: ScannerInstrument) => {
      const now = Date.now();
      const cur = ref.current;
      const existing = cur.find((s) => s.instrument.instrument === ins.instrument);
      const id = existing ? existing.id : uid(ins.displayName || ins.instrument);
      const next = existing
        ? cur.map((s) => (s.id === id ? { ...s, state: "expanded" as ScannerState, zIndex: maxZ(cur) + 1, lastViewedAt: now } : s))
        : [
            ...cur,
            { id, instrument: ins, state: "expanded" as ScannerState, pinned: false, zIndex: maxZ(cur) + 1, position: defaultPosition(cur.length), createdAt: now, lastViewedAt: now },
          ].slice(-MAX_SCANNERS);
      commit(next);
      requestFocus(id);
    },
    [commit, requestFocus],
  );

  const bringToFront = useCallback((id: string) => commit(ref.current.map((s) => (s.id === id ? { ...s, zIndex: maxZ(ref.current) + 1 } : s))), [commit]);
  const focusFn = useCallback(
    (id: string) => {
      commit(ref.current.map((s) => (s.id === id ? { ...s, state: "expanded" as ScannerState, zIndex: maxZ(ref.current) + 1, lastViewedAt: Date.now() } : s)));
      requestFocus(id);
    },
    [commit, requestFocus],
  );
  const expand = useCallback((id: string) => commit(ref.current.map((s) => (s.id === id ? { ...s, state: "expanded" as ScannerState, zIndex: maxZ(ref.current) + 1 } : s))), [commit]);
  const minimise = useCallback((id: string) => commit(ref.current.map((s) => (s.id === id ? { ...s, state: "minimised" as ScannerState } : s))), [commit]);
  const minimiseAll = useCallback(() => commit(ref.current.map((s) => ({ ...s, state: "minimised" as ScannerState }))), [commit]);
  const togglePin = useCallback((id: string) => commit(ref.current.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s))), [commit]);
  const close = useCallback((id: string) => commit(ref.current.filter((s) => s.id !== id)), [commit]);
  const closeAllUnpinned = useCallback(() => commit(ref.current.filter((s) => s.pinned)), [commit]);
  const setPosition = useCallback((id: string, x: number, y: number) => commit(ref.current.map((s) => (s.id === id ? { ...s, position: { x, y } } : s))), [commit]);
  const has = useCallback((instrument: string) => scanners.some((s) => s.instrument.instrument === instrument), [scanners]);

  return (
    <Ctx.Provider
      value={{ scanners, open, focus: focusFn, minimise, minimiseAll, expand, togglePin, close, closeAllUnpinned, bringToFront, setPosition, has, focusNonce: focus.nonce, focusedId: focus.id }}
    >
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
      minimiseAll: () => {},
      expand: () => {},
      togglePin: () => {},
      close: () => {},
      closeAllUnpinned: () => {},
      bringToFront: () => {},
      setPosition: () => {},
      has: () => false,
      focusNonce: 0,
      focusedId: null,
    };
  }
  return ctx;
}
