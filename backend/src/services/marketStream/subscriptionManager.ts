// =====================================================================
// Subscription manager (PURE, no I/O) — ref-counted set of instrument tokens the
// relay needs streamed, plus a diff against what the socket currently carries.
//
// Interest comes from several sources at once (the always-on top-strip indices +
// VIX, and each connected SSE client's instruments). Ref-counting means a token
// stays subscribed while ANY source wants it and is unsubscribed only when the
// last one leaves — so closing one client never drops indices another still needs.
// =====================================================================

export interface ReconcilePlan {
  subscribe: number[]; // tokens to (re)subscribe on the socket
  unsubscribe: number[]; // tokens to drop from the socket
}

export class SubscriptionManager {
  private refs = new Map<number, number>(); // token → active reference count
  private subscribed = new Set<number>(); // tokens currently live on the socket
  private readonly max: number;

  constructor(maxSubscriptions = 3000) {
    this.max = Math.max(1, maxSubscriptions);
  }

  /** Add one reference for each token (deduped). */
  addRefs(tokens: Iterable<number>): void {
    for (const t of tokens) {
      if (!Number.isFinite(t) || t <= 0) continue;
      this.refs.set(t, (this.refs.get(t) ?? 0) + 1);
    }
  }

  /** Release one reference for each token; drops the entry at zero. */
  removeRefs(tokens: Iterable<number>): void {
    for (const t of tokens) {
      const n = this.refs.get(t);
      if (n == null) continue;
      if (n <= 1) this.refs.delete(t);
      else this.refs.set(t, n - 1);
    }
  }

  /** Tokens that currently have at least one reference (capped at `max`). */
  desired(): number[] {
    const all = Array.from(this.refs.keys());
    return all.length > this.max ? all.slice(0, this.max) : all;
  }

  /** Diff desired vs socket state → what to subscribe / unsubscribe now. */
  reconcile(): ReconcilePlan {
    const want = new Set(this.desired());
    const subscribe: number[] = [];
    const unsubscribe: number[] = [];
    for (const t of want) if (!this.subscribed.has(t)) subscribe.push(t);
    for (const t of this.subscribed) if (!want.has(t)) unsubscribe.push(t);
    return { subscribe, unsubscribe };
  }

  markSubscribed(tokens: Iterable<number>): void {
    for (const t of tokens) this.subscribed.add(t);
  }
  markUnsubscribed(tokens: Iterable<number>): void {
    for (const t of tokens) this.subscribed.delete(t);
  }

  /** After a reconnect the socket carries nothing — everything desired must be re-sent. */
  resetSocketState(): void {
    this.subscribed.clear();
  }

  /** All tokens to (re)subscribe after a reconnect. */
  onReconnect(): number[] {
    this.resetSocketState();
    return this.desired();
  }

  stats(): { desired: number; subscribed: number; distinct: number } {
    return { desired: this.desired().length, subscribed: this.subscribed.size, distinct: this.refs.size };
  }
}
