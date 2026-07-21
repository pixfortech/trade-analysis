import type { Request, Response } from "express";
import { intelConfig } from "../config/intelligence.config";
import { registerClient, unregisterClient, getStreamStatus } from "../services/marketStream/streamHub";

/**
 * GET /api/stream/ticks?instruments=NSE:NIFTY 50,NSE:INFY  (Server-Sent Events)
 *
 * A READ-ONLY price relay. The browser opens an EventSource; the server streams
 * `status` + `tick` events (prices only — the Kite access token NEVER leaves the
 * process). EventSource reconnects on its own; the hub handles the upstream Kite
 * reconnect/resubscribe. Emits an initial status + cached snapshot immediately so
 * CMP renders without waiting for the first live tick.
 */
export function streamTicks(req: Request, res: Response): void {
  const raw = typeof req.query.instruments === "string" ? req.query.instruments : "";
  const keys = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes(":"))
    .slice(0, intelConfig.stream.maxSubscriptions);

  // SSE headers. no-transform + X-Accel-Buffering:no keep proxies from buffering.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Register for live ticks; push status + snapshot immediately.
  const handle = registerClient(keys, send);
  send("status", getStreamStatus());
  for (const t of handle.snapshot) send("tick", t);
  send("ready", { subscribed: handle.tokens.length, requested: keys.length });

  // Keepalive comment so intermediaries don't idle-close the stream.
  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(`: keepalive ${Date.now()}\n\n`);
  }, intelConfig.stream.sseKeepaliveMs);

  const cleanup = () => {
    clearInterval(keepalive);
    unregisterClient(handle.id);
  };
  req.on("close", cleanup);
  res.on("error", cleanup);
}

/** GET /api/stream/status — current relay connection state (JSON, secret-free). */
export function streamStatus(_req: Request, res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ...getStreamStatus(), readOnly: true });
}
