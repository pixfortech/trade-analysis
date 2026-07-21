// =====================================================================
// Stream hub — orchestrates the Kite ticker → tick store → SSE fan-out.
// ---------------------------------------------------------------------
// Single server-side owner of the live market-data relay:
//   • one KiteTicker (persistent wss connection, reconnect, resubscribe)
//   • a ref-counted SubscriptionManager (always-on indices/VIX + per-client)
//   • a TickStore (latest tick per token, for snapshots + freshness)
//   • an SSE client registry (each client streams ONLY prices, never a token)
//
// Subscriptions follow demand: the always-on top-strip indices + India VIX hold a
// permanent reference so they stream continuously; each connected client adds/
// releases references for its instruments; a token is dropped from the socket only
// when the last reference leaves. On reconnect every desired token is re-subscribed.
// =====================================================================

import { intelConfig } from "../../config/intelligence.config";
import { getStreamCredentials, isLiveDataEnabled, onAuthenticated } from "../kite.service";
import { ensureLoaded, lookupByKey, lookupByToken } from "../instruments.service";
import { KiteTicker } from "./kiteTicker";
import { SubscriptionManager } from "./subscriptionManager";
import { TickStore, type StreamStatus, type StreamState } from "./tickStore";
import type { Tick } from "./kiteBinary";

export interface TickPayload {
  key: string; // canonical EXCHANGE:TRADINGSYMBOL
  token: number;
  ltp: number;
  isIndex: boolean;
  mode: string;
  /** Best available source instant (exchange timestamp if present, else receipt). */
  tsMs: number;
  /** Exchange-stamped instant if the packet carried one (full mode), else null. */
  exchangeTsMs: number | null;
  /** Relay receipt instant — the freshness clock. */
  receivedMs: number;
  ohlc: Tick["ohlc"];
  change: number | null;
  volume: number | null;
  oi: number | null;
  source: "ws";
}

interface StreamClient {
  id: number;
  tokens: number[];
  send: (event: string, data: unknown) => void;
}

const subs = new SubscriptionManager(intelConfig.stream.maxSubscriptions);
const store = new TickStore();
const clients = new Map<number, StreamClient>();
const tokenListeners = new Map<number, Set<StreamClient>>();

let ticker: KiteTicker | null = null;
let started = false;
let everConnected = false;
let alwaysOnTokens: number[] = [];
let nextClientId = 1;

function log(msg: string): void {
  // eslint-disable-next-line no-console
  if (process.env.NODE_ENV !== "test") console.log(`[stream] ${msg}`);
}

/** Boot the relay. Safe to call once at startup; a no-op when WS is disabled. */
export async function startStreamHub(): Promise<void> {
  if (started) return;
  started = true;
  if (!intelConfig.stream.wsEnabled) {
    log("WebSocket streaming disabled (STREAM_WS_ENABLED=false) — REST polling only.");
    return;
  }

  ticker = new KiteTicker({
    wsUrl: intelConfig.stream.wsUrl,
    reconnectMs: intelConfig.stream.reconnectBaseMs,
    maxReconnectMs: intelConfig.stream.reconnectMaxMs,
    heartbeatTimeoutMs: intelConfig.stream.heartbeatTimeoutMs,
    mode: intelConfig.stream.wsMode,
    getCredentials: () => getStreamCredentials(),
    onResubscribe: () => {
      const tokens = subs.onReconnect();
      subs.markSubscribed(tokens); // the ticker subscribes these right after
      return tokens;
    },
    log,
  });

  ticker.on("ticks", handleTicks);
  ticker.on("connect", () => {
    everConnected = true;
    broadcastStatus();
  });
  ticker.on("disconnect", (d) => {
    log(`ticker disconnected (code ${d.code})`);
    broadcastStatus();
  });
  ticker.on("reconnecting", () => broadcastStatus());
  ticker.on("error", (m) => log(m));

  // Resolve the always-on set (top-strip indices + VIX) once instruments load.
  try {
    await ensureLoaded();
  } catch (e) {
    log(`instruments load failed: ${(e as Error).message}`);
  }
  const alwaysOnKeys = [...intelConfig.defaults.topStripSymbols.map((s) => s.instrument), intelConfig.defaults.vixQuoteSymbol];
  alwaysOnTokens = resolveKeys(alwaysOnKeys);
  subs.addRefs(alwaysOnTokens);
  log(`always-on tokens: ${alwaysOnTokens.length} (indices + VIX)`);

  onAuthenticated(() => {
    log("Kite authenticated — kicking ticker.");
    ticker?.kick();
  });
  // Only begin the connect/retry loop when live data is enabled. When it is off,
  // the ticker stays idle (status DISABLED, REST fallback); a later login kicks it.
  if (isLiveDataEnabled()) {
    ticker.start();
    reconcile();
  } else {
    log("live data disabled — ticker idle until enabled + authenticated.");
  }
}

export function stopStreamHub(): void {
  ticker?.stop();
  ticker = null;
  clients.clear();
  tokenListeners.clear();
  store.clear();
  started = false;
  everConnected = false;
}

/* ------------------------------ resolution ------------------------------- */
function resolveKeys(keys: string[]): number[] {
  const out: number[] = [];
  for (const k of keys) {
    const ins = lookupByKey(k);
    if (ins && Number.isFinite(ins.instrumentToken) && ins.instrumentToken > 0) out.push(ins.instrumentToken);
  }
  return Array.from(new Set(out));
}

function tokenToKey(token: number): string {
  const ins = lookupByToken(token);
  return ins ? `${ins.exchange}:${ins.tradingsymbol}` : String(token);
}

/* ---------------------------- client registry ---------------------------- */
export interface ClientHandle {
  id: number;
  tokens: number[];
  snapshot: TickPayload[];
}

/** Register an SSE client for a set of instrument keys. Returns an immediate
 *  snapshot of any cached ticks; live ticks then flow via `send`. */
export function registerClient(keys: string[], send: (event: string, data: unknown) => void): ClientHandle {
  const tokens = resolveKeys(keys);
  const client: StreamClient = { id: nextClientId++, tokens, send };
  clients.set(client.id, client);
  for (const t of tokens) {
    let set = tokenListeners.get(t);
    if (!set) tokenListeners.set(t, (set = new Set()));
    set.add(client);
  }
  subs.addRefs(tokens);
  reconcile();
  const snapshot = store.getMany(tokens).map((s) => toPayload(s.token, s));
  return { id: client.id, tokens, snapshot };
}

export function unregisterClient(id: number): void {
  const client = clients.get(id);
  if (!client) return;
  clients.delete(id);
  for (const t of client.tokens) {
    const set = tokenListeners.get(t);
    if (set) {
      set.delete(client);
      if (set.size === 0) tokenListeners.delete(t);
    }
  }
  subs.removeRefs(client.tokens);
  reconcile();
}

/* ------------------------------ tick fan-out ----------------------------- */
function handleTicks(ticks: Tick[]): void {
  const now = Date.now();
  for (const tick of ticks) {
    store.set(tick, now);
    const listeners = tokenListeners.get(tick.token);
    if (!listeners || listeners.size === 0) continue;
    const payload = toPayload(tick.token, { ...tick, receivedAtMs: now });
    for (const c of listeners) c.send("tick", payload);
  }
}

function toPayload(token: number, s: Tick & { receivedAtMs: number }): TickPayload {
  return {
    key: tokenToKey(token),
    token,
    ltp: s.ltp,
    isIndex: s.isIndex,
    mode: s.mode,
    tsMs: s.exchangeTimestampMs ?? s.receivedAtMs,
    exchangeTsMs: s.exchangeTimestampMs,
    receivedMs: s.receivedAtMs,
    ohlc: s.ohlc,
    change: s.change,
    volume: s.volume,
    oi: s.oi,
    source: "ws",
  };
}

/* --------------------------- subscription diff --------------------------- */
function reconcile(): void {
  if (!ticker || !ticker.isConnected()) return; // resubscribe-on-connect covers the rest
  const plan = subs.reconcile();
  if (plan.subscribe.length) {
    ticker.subscribe(plan.subscribe);
    subs.markSubscribed(plan.subscribe);
  }
  if (plan.unsubscribe.length) {
    ticker.unsubscribe(plan.unsubscribe);
    subs.markUnsubscribed(plan.unsubscribe);
  }
}

/* -------------------------------- status --------------------------------- */
export function getStreamStatus(): StreamStatus {
  let state: StreamState;
  let message: string;
  if (!intelConfig.stream.wsEnabled) {
    state = "DISABLED";
    message = "WebSocket streaming disabled by config — REST polling only.";
  } else if (!isLiveDataEnabled()) {
    state = "DISABLED";
    message = "Live Kite data disabled — REST polling only.";
  } else if (ticker?.isConnected()) {
    state = "LIVE";
    message = "Streaming live from Kite.";
  } else if (getStreamCredentials() == null) {
    state = "DISCONNECTED";
    message = "Waiting for Kite login to start streaming.";
  } else if (everConnected) {
    state = "DEGRADED";
    message = "Stream interrupted — reconnecting (REST fallback active).";
  } else {
    state = "CONNECTING";
    message = "Connecting to the Kite stream…";
  }
  return {
    state,
    connectedSince: ticker?.since() ?? null,
    lastMessageMs: ticker?.lastMessageAt() ?? null,
    reconnectAttempts: ticker?.reconnectAttempts() ?? 0,
    subscribed: subs.stats().subscribed,
    message,
  };
}

function broadcastStatus(): void {
  const status = getStreamStatus();
  for (const c of clients.values()) c.send("status", status);
}
