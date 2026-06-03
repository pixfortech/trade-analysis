"use client";

// AI Assistant Virtual Trades (Phase 3M).
// SEPARATE from Paper Trade / Manual Trade Tracker. Purpose: track a real trade
// taken in another account, or a serious AI-assisted virtual position, so the
// assistant switches to POSITION MANAGER mode and gives live exit/hold/trail
// guidance from CMP. Persisted under its own key. Read-only/advisory — adding a
// virtual trade never places a real order.

import { useCallback, useEffect, useState } from "react";

export type VtSide = "LONG" | "SHORT";
export type VtStatus = "OPEN" | "CLOSED";

export interface AiVirtualTrade {
  id: string;
  instrumentKey: string; // EXCHANGE:TRADINGSYMBOL
  displayName: string;
  exchange: string;
  instrumentToken: number | null;
  side: VtSide;
  entryPrice: number;
  quantity: number; // total units (lots × lotSize)
  lotSize: number;
  lots: number;
  entryTime: string; // ISO
  stopLoss: number | null;
  target: number | null;
  notes: string;
  status: VtStatus;
  exitPrice: number | null;
  exitTime: string | null;
}

export interface NewVirtualTrade {
  instrumentKey: string;
  displayName: string;
  exchange: string;
  instrumentToken?: number | null;
  side: VtSide;
  entryPrice: number;
  lotSize: number;
  lots: number;
  stopLoss?: number | null;
  target?: number | null;
  notes?: string;
}

const KEY = "ai-assistant.virtual-trades.v1";

function load(): AiVirtualTrade[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((t) => t && typeof t.id === "string" && typeof t.instrumentKey === "string");
  } catch {
    return [];
  }
}

function persist(list: AiVirtualTrade[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function uid(): string {
  return `vt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** localStorage-backed AI virtual trades (separate from Paper Trades). */
export function useAiVirtualTrades() {
  const [trades, setTrades] = useState<AiVirtualTrade[]>([]);

  useEffect(() => {
    setTrades(load());
  }, []);

  const update = useCallback((next: AiVirtualTrade[]) => {
    setTrades(next);
    persist(next);
  }, []);

  const add = useCallback(
    (input: NewVirtualTrade): AiVirtualTrade => {
      const lots = Math.max(1, Math.round(input.lots || 1));
      const lotSize = Math.max(1, Math.round(input.lotSize || 1));
      const t: AiVirtualTrade = {
        id: uid(),
        instrumentKey: input.instrumentKey,
        displayName: input.displayName,
        exchange: input.exchange,
        instrumentToken: input.instrumentToken ?? null,
        side: input.side,
        entryPrice: input.entryPrice,
        quantity: lots * lotSize,
        lotSize,
        lots,
        entryTime: new Date().toISOString(),
        stopLoss: input.stopLoss ?? null,
        target: input.target ?? null,
        notes: input.notes ?? "",
        status: "OPEN",
        exitPrice: null,
        exitTime: null,
      };
      setTrades((cur) => {
        const next = [t, ...cur];
        persist(next);
        return next;
      });
      return t;
    },
    [],
  );

  const edit = useCallback((id: string, patch: Partial<AiVirtualTrade>) => {
    setTrades((cur) => {
      const next = cur.map((t) => {
        if (t.id !== id) return t;
        const merged = { ...t, ...patch };
        // keep quantity consistent if lots/lotSize changed
        if (patch.lots != null || patch.lotSize != null) merged.quantity = Math.max(1, merged.lots) * Math.max(1, merged.lotSize);
        return merged;
      });
      persist(next);
      return next;
    });
  }, []);

  const close = useCallback((id: string, exitPrice: number) => {
    setTrades((cur) => {
      const next = cur.map((t) => (t.id === id ? { ...t, status: "CLOSED" as VtStatus, exitPrice, exitTime: new Date().toISOString() } : t));
      persist(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTrades((cur) => {
      const next = cur.filter((t) => t.id !== id);
      persist(next);
      return next;
    });
  }, []);

  /** Reset AI virtual trades ONLY (never touches Paper Trades). */
  const reset = useCallback(() => update([]), [update]);

  const openForInstrument = useCallback(
    (instrumentKey: string) => trades.filter((t) => t.instrumentKey === instrumentKey && t.status === "OPEN"),
    [trades],
  );

  return { trades, add, edit, close, remove, reset, openForInstrument };
}
