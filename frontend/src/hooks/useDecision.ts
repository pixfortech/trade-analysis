"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import type { DecisionSnapshot } from "@/types/api";

export interface DecisionState {
  d: DecisionSnapshot | null;
  status: "loading" | "idle" | "error";
  err: string | null;
  refreshedAt: number | null;
  reload: () => void;
}

/**
 * Single source of truth for the real-time decision snapshot. Fetches one tick,
 * polls on the config interval while `live`, refetches on Kite reconnect, and —
 * critically — clears old data instantly on instrument/timeframe/mode change and
 * IGNORES stale responses (request-version guard) so news/decision always follow
 * the current selection. Both the primary strip and the evidence tabs consume it.
 */
export function useDecision(instrument: string | null, interval: string, riskProfile: string, live: boolean): DecisionState {
  const [d, setD] = useState<DecisionSnapshot | null>(null);
  const [status, setStatus] = useState<DecisionState["status"]>("loading");
  const [err, setErr] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const cfg = usePublicConfig();
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    if (!instrument) return;
    const myId = ++reqId.current;
    try {
      const res = await api.decision({ instrument, interval, riskProfile });
      if (myId !== reqId.current) return; // superseded by a newer request
      setD(res);
      setRefreshedAt(Date.now());
      setStatus("idle");
      setErr(null);
    } catch (e) {
      if (myId !== reqId.current) return;
      setErr(e instanceof Error ? e.message : "Decision engine unavailable.");
      setStatus("error");
    }
  }, [instrument, interval, riskProfile]);

  useEffect(() => {
    reqId.current++; // invalidate any in-flight request for the previous selection
    setD(null);
    if (!instrument) { setStatus("idle"); return; }
    setStatus("loading");
    setErr(null);
    void reload();
  }, [reload, instrument]);

  useEffect(() => {
    if (!live || !instrument) return;
    const id = window.setInterval(() => void reload(), cfg.refresh.intelligenceMs);
    return () => window.clearInterval(id);
  }, [live, instrument, reload, cfg.refresh.intelligenceMs]);

  useKiteConnected(() => { if (instrument) { setStatus("loading"); setErr(null); void reload(); } });

  return { d, status, err, refreshedAt, reload: () => void reload() };
}
