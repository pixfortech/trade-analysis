"use client";

import { useEffect, useRef, useState } from "react";
import { getBackendBaseUrl } from "@/lib/apiClient";
import { usePublicConfig } from "@/hooks/usePublicConfig";

// =====================================================================
// Real-time decision stream consumer (§11–§14). Opens an SSE connection to the
// backend decision authority (GET /api/stream/decision) for the CURRENT locked
// plan and receives coherent `decision` snapshots — CMP, indicators, evidence,
// win and action all from the SAME tick-built candle state. The frontend no
// longer combines a live CMP with 5-second-old indicators; when this stream is
// healthy it is AUTHORITATIVE and the polls are fallback only.
//
// Versioning (§12): every snapshot carries `seq`; older / out-of-order / previous-
// instrument snapshots are ignored, and an instrument change clears state at once.
// =====================================================================

export interface RealtimeDecision {
  seq: number;
  instrument: string;
  interval: string;
  cmp: number;
  candle: { forming: { t: string; o: number; h: number; l: number; c: number; v: number } | null; formingClosed: boolean; lastClosed: { t: string; c: number } | null };
  evidence: { category: string; direction: string; score: number; items: string[] }[];
  trend: { direction: string; strength: string; score: number };
  winEstimate: number;
  setupStrength: number;
  action: string;
  approved: boolean;
  lateEntry: boolean;
  remainingRR: number | null;
  distanceToEntry: number | null;
  reasons: string[];
  freshness: {
    tickTsMs: number | null;
    tickReceivedMs: number;
    indicatorCalcMs: number;
    decisionCalcMs: number;
    formingCandle: boolean;
    lastClosedTsMs: number | null;
    tickAgeMs: number;
    stale: boolean;
    blockReason: string | null;
  };
  timings: { indicatorMs: number; decisionMs: number; totalMs: number };
}

export type DecisionStreamState = "IDLE" | "CONNECTING" | "SUBSCRIBED" | "WARMING" | "DISABLED" | "DEGRADED";

export interface DecisionStreamPlan {
  direction: "LONG" | "SHORT";
  entry: number;
  safeLow: number;
  safeHigh: number;
  stop: number;
  target1: number;
  target2: number | null;
  invalidation: number;
  atr: number | null;
  analysedCmp: number;
  analysedAtMs: number | null;
}

function buildQuery(instrument: string, interval: string, plan: DecisionStreamPlan): string {
  const p = new URLSearchParams();
  p.set("instrument", instrument);
  p.set("interval", interval);
  p.set("direction", plan.direction);
  const nums: [string, number | null][] = [
    ["entry", plan.entry], ["safeLow", plan.safeLow], ["safeHigh", plan.safeHigh], ["stop", plan.stop],
    ["target1", plan.target1], ["target2", plan.target2], ["invalidation", plan.invalidation], ["atr", plan.atr],
    ["analysedCmp", plan.analysedCmp], ["analysedAtMs", plan.analysedAtMs],
  ];
  for (const [k, v] of nums) if (v != null) p.set(k, String(v));
  return p.toString();
}

/**
 * Subscribe to the backend real-time decision stream for a locked plan. Returns
 * the latest coherent snapshot, the stream state and whether it is authoritative
 * (SUBSCRIBED and the driving tick is fresh). Reopens on instrument/interval/plan
 * change; ignores stale, out-of-order and previous-instrument snapshots.
 */
export function useDecisionStream(args: { instrument: string | null; interval: string; plan: DecisionStreamPlan | null; enabled: boolean }): {
  snapshot: RealtimeDecision | null;
  state: DecisionStreamState;
  authoritative: boolean;
} {
  const cfg = usePublicConfig();
  const wsEnabled = cfg.stream.wsEnabled && cfg.stream.decisionEnabled;
  const [snapshot, setSnapshot] = useState<RealtimeDecision | null>(null);
  const [state, setState] = useState<DecisionStreamState>("IDLE");
  const lastSeqRef = useRef(0);

  // A stable key: reopen only when the instrument / interval / locked levels change.
  const key = args.enabled && args.instrument && args.plan && wsEnabled ? `${args.instrument}|${args.interval}|${buildQuery(args.instrument, args.interval, args.plan)}` : "";

  useEffect(() => {
    if (!key) {
      setState("IDLE");
      setSnapshot(null);
      lastSeqRef.current = 0;
      return;
    }
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    // Instrument/plan change → clear previous state immediately (§12).
    setSnapshot(null);
    lastSeqRef.current = 0;
    setState("CONNECTING");

    const instrument = key.split("|")[0];
    const es = new EventSource(`${getBackendBaseUrl()}/api/stream/decision?${key.split("|").slice(2).join("|")}`);

    es.addEventListener("decision", (e) => {
      try {
        const snap = JSON.parse((e as MessageEvent).data) as RealtimeDecision;
        if (snap.instrument !== instrument) return; // previous-instrument event
        if (snap.seq <= lastSeqRef.current) return; // older / out-of-order (§12)
        lastSeqRef.current = snap.seq;
        setSnapshot(snap);
        setState("SUBSCRIBED");
      } catch {
        /* ignore malformed */
      }
    });
    es.addEventListener("decision-status", (e) => {
      try {
        const s = JSON.parse((e as MessageEvent).data) as { state: string };
        if (s.state === "WARMING") setState("WARMING");
        else if (s.state === "DISABLED") setState("DISABLED");
        else if (s.state === "SUBSCRIBED") setState((prev) => (prev === "CONNECTING" ? "SUBSCRIBED" : prev));
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => setState((prev) => (prev === "DISABLED" ? prev : "DEGRADED"));

    return () => es.close();
  }, [key]);

  const authoritative = state === "SUBSCRIBED" && snapshot != null && !snapshot.freshness.stale;
  return { snapshot, state, authoritative };
}
