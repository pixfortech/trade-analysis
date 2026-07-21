// =====================================================================
// Real-time decision manager — the LIVE glue for the pure pipeline.
// ---------------------------------------------------------------------
// Owns per-instrument decision SESSIONS. Each session holds the LOCKED plan (sent
// once by the client at Analyse) and an SSE writer. The stream hub calls onTick()
// after folding each Kite tick into the candle series; this manager then recomputes
// a coherent decision snapshot (buildDecisionSnapshot) from the SAME tick-built
// candle state and pushes it to the session — event-driven, not on a timer.
//
// Recompute is coalesced to a minimum interval so a burst of ticks does not spin
// the CPU; hard risk (stop/invalidation) is NOT throttled — it is detected on the
// very tick that breaches it (the entry/exit machine reads the current CMP).
// Levels are LOCKED and never mutated.
// =====================================================================

import { intelConfig } from "../../config/intelligence.config";
import { buildDecisionSnapshot, type LockedPlan, type RealtimeDecisionSnapshot } from "../realtimeDecision";
import type { PositionInput } from "../entryStateMachine";
import * as candleService from "./candleService";

interface DecisionSession {
  id: number;
  token: number;
  instrument: string;
  interval: string;
  plan: LockedPlan;
  position: PositionInput | null;
  send: (event: string, data: unknown) => void;
  seq: number;
  lastEmitMs: number;
  lastAction: string | null;
}

const sessions = new Map<number, DecisionSession>();
const byToken = new Map<number, Set<number>>();
let nextId = 1;

export interface CreateSessionParams {
  token: number;
  instrument: string;
  interval: string;
  plan: LockedPlan;
  position?: PositionInput | null;
}

/** Register a decision session; returns its id and an immediate snapshot (if warm). */
export function createDecisionSession(p: CreateSessionParams, send: (event: string, data: unknown) => void): { id: number; snapshot: RealtimeDecisionSnapshot | null } {
  const s: DecisionSession = { id: nextId++, token: p.token, instrument: p.instrument, interval: p.interval, plan: p.plan, position: p.position ?? null, send, seq: 0, lastEmitMs: 0, lastAction: null };
  sessions.set(s.id, s);
  let set = byToken.get(p.token);
  if (!set) byToken.set(p.token, (set = new Set()));
  set.add(s.id);
  const snap = recompute(s, Date.now(), true);
  return { id: s.id, snapshot: snap };
}

export function removeDecisionSession(id: number): void {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  const set = byToken.get(s.token);
  if (set) {
    set.delete(id);
    if (set.size === 0) byToken.delete(s.token);
  }
}

/** Update a session's tracked position (starts/stops the EXIT machine). */
export function setSessionPosition(id: number, position: PositionInput | null): void {
  const s = sessions.get(id);
  if (s) s.position = position;
}

/**
 * Called by the stream hub after each tick is folded into the candle series.
 * Recomputes + emits for every session on this token, coalesced to a min interval.
 * A change of ACTION always emits immediately (transitions are never dropped).
 */
export function onDecisionTick(token: number, nowMs: number): void {
  const set = byToken.get(token);
  if (!set) return;
  for (const id of set) {
    const s = sessions.get(id);
    if (s) recompute(s, nowMs, false);
  }
}

function recompute(s: DecisionSession, nowMs: number, force: boolean): RealtimeDecisionSnapshot | null {
  const candles = candleService.getLiveCandles(s.token, s.interval, nowMs);
  if (!candles || candles.length < intelConfig.loop.dataQuality.minCandles) {
    // Not warm yet (cold start / gap) — the REST fallback seeds the series.
    if (force) s.send("decision-status", { state: "WARMING", instrument: s.instrument, message: "Seeding candles from history…" });
    return null;
  }
  const snap = buildDecisionSnapshot({
    seq: ++s.seq,
    instrument: s.instrument,
    interval: s.interval,
    candles,
    formingClosed: false,
    plan: s.plan,
    position: s.position,
    nowMs,
    tickReceivedMs: nowMs,
    freshness: { tickMs: intelConfig.stream.tickStaleMs, contextMs: intelConfig.trade.evidenceStaleMs },
  });

  // Emit on: forced (initial), an ACTION transition (never dropped), or the min
  // coalescing interval — so hard-stop/entry transitions are immediate.
  const changed = snap.action !== s.lastAction;
  if (force || changed || nowMs - s.lastEmitMs >= intelConfig.stream.decisionMinIntervalMs) {
    s.lastEmitMs = nowMs;
    s.lastAction = snap.action;
    s.send("decision", snap);
  } else {
    s.seq--; // no emit — don't burn a version number
  }
  return snap;
}

export function decisionSessionCount(): number {
  return sessions.size;
}
