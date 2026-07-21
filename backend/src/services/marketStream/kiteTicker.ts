// =====================================================================
// Kite ticker — server-side WebSocket client for wss://ws.kite.trade.
// ---------------------------------------------------------------------
// Thin, self-contained wrapper on `ws` (Node has no stable built-in WS client on
// the supported runtime). It owns ONE persistent connection using the server-side
// api_key + access_token, auto-reconnects with capped exponential backoff,
// re-subscribes every desired token on (re)connect, and runs a heartbeat watchdog
// (Kite streams a heartbeat frame ~1/s; silence ⇒ force-reconnect).
//
// SECURITY: credentials are pulled from an injected getter (kite.service) at
// connect time and placed ONLY in the wss URL. Neither the token nor the URL is
// ever logged. This class emits parsed ticks + lifecycle events; it never sends
// anything to browser clients directly (the hub/SSE relay does, prices only).
// =====================================================================

import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { parseTicks, subscribeMessage, unsubscribeMessage, modeMessage, type Tick, type TickMode } from "./kiteBinary";

export interface TickerCredentials {
  apiKey: string;
  accessToken: string;
}

export interface KiteTickerOptions {
  wsUrl: string; // e.g. wss://ws.kite.trade
  reconnectMs: number; // base backoff
  maxReconnectMs: number; // backoff ceiling
  heartbeatTimeoutMs: number; // no frame within this ⇒ force reconnect
  mode: TickMode; // default subscription mode (full ⇒ carries exchange timestamp)
  /** Returns live credentials, or null when live data is off / not authenticated. */
  getCredentials: () => TickerCredentials | null;
  /** Called on (re)connect to obtain the full set of tokens to (re)subscribe. */
  onResubscribe: () => number[];
  /** Safe logger (never receives secrets). */
  log?: (msg: string) => void;
}

type TickerEvents = {
  ticks: [Tick[]];
  connect: [];
  disconnect: [{ code: number; reason: string }];
  reconnecting: [{ attempt: number; delayMs: number }];
  error: [string];
};

export class KiteTicker extends EventEmitter<TickerEvents> {
  private ws: WebSocket | null = null;
  private started = false;
  private attempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastMessageMs = 0;
  private connected = false;
  private connectedSince: number | null = null;

  constructor(private readonly opts: KiteTickerOptions) {
    super();
  }

  isConnected(): boolean {
    return this.connected;
  }
  since(): number | null {
    return this.connectedSince;
  }
  lastMessageAt(): number {
    return this.lastMessageMs;
  }
  reconnectAttempts(): number {
    return this.attempts;
  }

  /** Begin maintaining the connection (idempotent). No-op resolves later via reconnect if creds are absent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.open();
  }

  /** Tear down and stop reconnecting. */
  stop(): void {
    this.started = false;
    this.clearTimers();
    this.connected = false;
    this.connectedSince = null;
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  /** Force a fresh connection attempt now (e.g. right after a login). */
  kick(): void {
    if (!this.started) {
      this.start();
      return;
    }
    if (!this.connected) {
      this.clearTimers();
      this.attempts = 0;
      this.open();
    }
  }

  subscribe(tokens: number[]): void {
    if (tokens.length) {
      this.send(subscribeMessage(tokens));
      this.send(modeMessage(this.opts.mode, tokens));
    }
  }
  unsubscribe(tokens: number[]): void {
    if (tokens.length) this.send(unsubscribeMessage(tokens));
  }
  setMode(mode: TickMode, tokens: number[]): void {
    if (tokens.length) this.send(modeMessage(mode, tokens));
  }

  // ------------------------------------------------------------------
  private open(): void {
    if (!this.started) return;
    const creds = this.opts.getCredentials();
    if (!creds) {
      // Not live / not authenticated yet — retry later without spamming.
      this.scheduleReconnect();
      return;
    }
    const url = `${this.opts.wsUrl}?api_key=${encodeURIComponent(creds.apiKey)}&access_token=${encodeURIComponent(creds.accessToken)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url); // URL contains the token — NEVER log it.
    } catch (e) {
      this.emit("error", `ticker open failed: ${(e as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "nodebuffer";
    this.ws = ws;

    ws.on("open", () => {
      this.connected = true;
      this.connectedSince = Date.now();
      this.attempts = 0;
      this.lastMessageMs = Date.now();
      this.startHeartbeatWatchdog();
      // Re-subscribe everything the relay currently wants.
      const tokens = this.opts.onResubscribe();
      this.subscribe(tokens);
      this.opts.log?.(`ticker connected · resubscribed ${tokens.length} tokens`);
      this.emit("connect");
    });

    ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      this.lastMessageMs = Date.now();
      if (!isBinary) return; // text = app messages / errors; ticks are binary
      const buf = toBuffer(data);
      if (buf.length <= 2) return; // 1-byte heartbeat keeps the watchdog happy
      const ticks = parseTicks(buf);
      if (ticks.length) this.emit("ticks", ticks);
    });

    ws.on("error", (err: Error) => {
      this.emit("error", `ticker error: ${err.message}`); // message only, no token
    });

    ws.on("close", (code: number, reasonBuf: Buffer) => {
      const wasConnected = this.connected;
      this.connected = false;
      this.connectedSince = null;
      this.stopHeartbeatWatchdog();
      this.ws = null;
      if (wasConnected) this.emit("disconnect", { code, reason: reasonBuf?.toString() ?? "" });
      this.scheduleReconnect();
    });
  }

  private send(payload: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(payload);
      } catch (e) {
        this.emit("error", `ticker send failed: ${(e as Error).message}`);
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) return;
    this.attempts += 1;
    const delay = Math.min(this.opts.reconnectMs * 2 ** Math.min(this.attempts - 1, 6), this.opts.maxReconnectMs);
    this.emit("reconnecting", { attempt: this.attempts, delayMs: delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private startHeartbeatWatchdog(): void {
    this.stopHeartbeatWatchdog();
    const period = Math.max(1000, Math.floor(this.opts.heartbeatTimeoutMs / 2));
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastMessageMs > this.opts.heartbeatTimeoutMs) {
        this.opts.log?.("ticker heartbeat timeout — forcing reconnect");
        try {
          this.ws?.terminate(); // triggers 'close' → reconnect
        } catch {
          /* ignore */
        }
      }
    }, period);
  }
  private stopHeartbeatWatchdog(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeatWatchdog();
  }
}

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data as ArrayBuffer);
}
