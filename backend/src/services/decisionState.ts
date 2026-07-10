// =====================================================================
// Stateful decision store for the real-time loop (§12, §19, §20).
// In-memory per-(instrument|interval|riskProfile) state machine + transition
// history (audit trail) + anti-flicker hysteresis. State persists across polls
// within a single backend instance (ephemeral — resets on cold start; that is
// an accepted limitation for advisory, read-only analysis).
//
// Hysteresis: a non-critical action change must be PROPOSED for N consecutive
// ticks before it commits; ENTER needs its own (higher) count. Critical changes
// (confirmed EXIT / INVALIDATION / hard stop) commit immediately — a genuine
// stop is never delayed. After EXIT/INVALIDATED the key enters a COOLDOWN during
// which fresh ENTER is suppressed.
// =====================================================================

import { intelConfig } from "../config/intelligence.config";

export type LoopState =
  | "IDLE"
  | "WATCHING"
  | "SETUP_DETECTED"
  | "WAITING_FOR_TRIGGER"
  | "ENTRY_APPROVED"
  | "IN_TRADE"
  | "HOLDING"
  | "TRAILING"
  | "EXIT_WARNING"
  | "EXIT_APPROVED"
  | "INVALIDATED"
  | "COOLDOWN";

export type LoopAction = "ENTER" | "WAIT" | "HOLD" | "EXIT" | "AVOID" | "NO ACTION";

export interface Transition {
  at: string; // ISO with milliseconds
  fromState: LoopState;
  toState: LoopState;
  fromAction: LoopAction;
  toAction: LoopAction;
  cmp: number;
  trigger: number | null;
  confidence: number;
  winEstimate: number;
  vix: number | null;
  newsScore: number;
  marketTrend: string;
  reason: string;
  supporting: string[];
  blocking: string[];
}

export interface Proposal {
  action: LoopAction;
  state: LoopState;
  critical: boolean; // confirmed exit / invalidation / hard-stop → commit now
  reason: string;
  cmp: number;
  trigger: number | null;
  confidence: number;
  winEstimate: number;
  vix: number | null;
  newsScore: number;
  marketTrend: string;
  supporting: string[];
  blocking: string[];
}

interface Record {
  state: LoopState;
  action: LoopAction;
  enteredAt: number;
  cooldownUntil: number;
  pending: { action: LoopAction; state: LoopState; count: number } | null;
  history: Transition[];
}

export interface TransitionResult {
  state: LoopState;
  action: LoopAction;
  transitioned: boolean;
  stateSinceMs: number;
  inCooldown: boolean;
  /** How many confirmations a pending non-critical change has, and how many it needs. */
  pending: { action: LoopAction; count: number; required: number } | null;
  history: Transition[];
}

const store = new Map<string, Record>();
let clock: () => number = () => Date.now();

/** Test seam: override the clock. Pass nothing to reset to Date.now. */
export function _setClock(fn?: () => number): void {
  clock = fn ?? (() => Date.now());
}
/** Test seam: clear all state. */
export function _reset(): void {
  store.clear();
}

export function stateKey(instrument: string, interval: string, riskProfile: string): string {
  return `${instrument}|${interval}|${riskProfile}`;
}

function fresh(now: number): Record {
  return { state: "IDLE", action: "NO ACTION", enteredAt: now, cooldownUntil: 0, pending: null, history: [] };
}

function requiredConfirms(action: LoopAction): number {
  const h = intelConfig.loop.hysteresis;
  return action === "ENTER" ? h.enterConfirmations : h.minConfirmations;
}

/**
 * Apply a proposed action/state with hysteresis + cooldown. Returns the
 * EFFECTIVE state/action (which may still be the previous one while a change is
 * confirming) plus the transition history. Records an audit entry on commit.
 */
export function applyTransition(key: string, p: Proposal): TransitionResult {
  const now = clock();
  const h = intelConfig.loop.hysteresis;
  const rec = store.get(key) ?? fresh(now);
  const inCooldown = now < rec.cooldownUntil;

  // Suppress a fresh ENTER while cooling down after an exit/invalidation.
  let proposed = p;
  if (inCooldown && (p.action === "ENTER" || p.state === "ENTRY_APPROVED")) {
    proposed = { ...p, action: "WAIT", state: "COOLDOWN", reason: `Cooldown active — ${p.reason}`, critical: false };
  }

  const unchanged = proposed.action === rec.action && proposed.state === rec.state;
  if (unchanged) {
    rec.pending = null;
    store.set(key, rec);
    return snapshot(rec, now, inCooldown, null);
  }

  const commitNow = () => {
    const t: Transition = {
      at: new Date(now).toISOString(),
      fromState: rec.state,
      toState: proposed.state,
      fromAction: rec.action,
      toAction: proposed.action,
      cmp: proposed.cmp,
      trigger: proposed.trigger,
      confidence: proposed.confidence,
      winEstimate: proposed.winEstimate,
      vix: proposed.vix,
      newsScore: proposed.newsScore,
      marketTrend: proposed.marketTrend,
      reason: proposed.reason,
      supporting: proposed.supporting.slice(0, 6),
      blocking: proposed.blocking.slice(0, 6),
    };
    rec.history.push(t);
    if (rec.history.length > h.maxHistory) rec.history.splice(0, rec.history.length - h.maxHistory);
    rec.state = proposed.state;
    rec.action = proposed.action;
    rec.enteredAt = now;
    rec.pending = null;
    if (proposed.state === "EXIT_APPROVED" || proposed.state === "INVALIDATED") rec.cooldownUntil = now + h.cooldownMs;
    store.set(key, rec);
    return snapshot(rec, now, now < rec.cooldownUntil, null);
  };

  // Critical changes (confirmed exit / invalidation / hard stop) never wait.
  if (proposed.critical) return commitNow();

  // Otherwise require N consecutive proposals AND a minimum dwell in the old state.
  const required = requiredConfirms(proposed.action);
  const samePending = rec.pending && rec.pending.action === proposed.action && rec.pending.state === proposed.state;
  rec.pending = { action: proposed.action, state: proposed.state, count: samePending ? rec.pending!.count + 1 : 1 };
  // Minimum dwell prevents rapid flip-flop between ACTIVE decisions; the passive
  // IDLE/WATCHING states are exempt so a first real setup isn't delayed.
  const dwellOk = rec.state === "IDLE" || rec.state === "WATCHING" || now - rec.enteredAt >= h.minStateDurationMs;

  if (rec.pending.count >= required && dwellOk) return commitNow();

  store.set(key, rec);
  return snapshot(rec, now, inCooldown, { action: rec.pending.action, count: rec.pending.count, required });
}

function snapshot(rec: Record, now: number, inCooldown: boolean, pending: TransitionResult["pending"]): TransitionResult {
  return {
    state: rec.state,
    action: rec.action,
    transitioned: rec.enteredAt === now,
    stateSinceMs: now - rec.enteredAt,
    inCooldown,
    pending,
    history: rec.history,
  };
}

/** Read the current state without mutating (for diagnostics). */
export function peekState(key: string): { state: LoopState; action: LoopAction } | null {
  const r = store.get(key);
  return r ? { state: r.state, action: r.action } : null;
}
