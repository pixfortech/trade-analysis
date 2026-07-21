// =====================================================================
// Tick store (PURE, no I/O) — latest tick per instrument token + freshness.
// ---------------------------------------------------------------------
// The relay keeps the most recent tick for every subscribed token so a new SSE
// client gets an immediate snapshot, and so freshness can gate fresh entries.
// Freshness uses the RECEIPT instant (when the relay got the packet); the
// exchange-stamped instant from the packet is carried through for display, but a
// clock-skewed exchange time must never make stale data look fresh.
// =====================================================================

import type { Tick } from "./kiteBinary";

export interface StoredTick extends Tick {
  receivedAtMs: number; // relay receipt instant (epoch ms) — the freshness clock
}

export class TickStore {
  private map = new Map<number, StoredTick>();

  set(tick: Tick, receivedAtMs: number): void {
    this.map.set(tick.token, { ...tick, receivedAtMs });
  }

  get(token: number): StoredTick | undefined {
    return this.map.get(token);
  }

  getMany(tokens: number[]): StoredTick[] {
    const out: StoredTick[] = [];
    for (const t of tokens) {
      const v = this.map.get(t);
      if (v) out.push(v);
    }
    return out;
  }

  /** A token is fresh when its last packet arrived within `staleMs`. */
  isFresh(token: number, staleMs: number, now: number): boolean {
    const v = this.map.get(token);
    return v != null && now - v.receivedAtMs <= staleMs;
  }

  /** Newest receipt instant across the given tokens (or all), else null. */
  lastReceivedMs(tokens?: number[]): number | null {
    let latest: number | null = null;
    const it = tokens ? this.getMany(tokens) : Array.from(this.map.values());
    for (const v of it) if (latest == null || v.receivedAtMs > latest) latest = v.receivedAtMs;
    return latest;
  }

  delete(token: number): void {
    this.map.delete(token);
  }
  clear(): void {
    this.map.clear();
  }
  size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------------
// Stream connection state — the single source of truth for STREAM LIVE /
// DEGRADED / etc., surfaced to the client so the UI never shows a bare "live".
// ---------------------------------------------------------------------
export type StreamState = "LIVE" | "CONNECTING" | "DEGRADED" | "DISCONNECTED" | "DISABLED";

export interface StreamStatus {
  state: StreamState;
  connectedSince: number | null; // epoch ms of the current LIVE session
  lastMessageMs: number | null; // last frame (any) from the socket
  reconnectAttempts: number;
  subscribed: number;
  message: string;
}
