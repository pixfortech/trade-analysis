import type { Request, Response } from "express";
import { intelConfig } from "../config/intelligence.config";
import { registerClient, unregisterClient, getStreamStatus } from "../services/marketStream/streamHub";
import { createDecisionSession, removeDecisionSession } from "../services/marketStream/realtimeDecisionManager";
import { ensureLoaded, lookupByKey } from "../services/instruments.service";
import { getLiveSignalWithData } from "../services/liveTradePlan.service";
import type { LockedPlan } from "../services/realtimeDecision";
import type { PositionInput } from "../services/entryStateMachine";

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

function n(v: unknown): number | null {
  const x = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
}

/**
 * GET /api/stream/decision?instrument=..&interval=..&direction=LONG&entry=..&…
 *
 * The REAL-TIME DECISION channel (§11). The client sends its LOCKED plan once (in
 * the query — small, ~11 numbers); the backend becomes the decision authority and
 * streams coherent `decision` snapshots computed from the SAME tick-built candle
 * state on each Kite tick. Prices/decisions only — the Kite token never leaves the
 * process. Levels are LOCKED server-side and never mutated.
 */
export async function streamDecision(req: Request, res: Response): Promise<void> {
  const q = req.query as Record<string, string | undefined>;
  const instrument = (q.instrument ?? "").trim();
  const interval = (q.interval ?? "5minute").trim();
  const direction = (q.direction ?? "").toUpperCase();

  const entry = n(q.entry), safeLow = n(q.safeLow), safeHigh = n(q.safeHigh), stop = n(q.stop), target1 = n(q.target1), invalidation = n(q.invalidation);
  const valid = instrument.includes(":") && (direction === "LONG" || direction === "SHORT") && entry != null && safeLow != null && safeHigh != null && stop != null && target1 != null && invalidation != null;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  send("decision-status", { state: "CONNECTING", instrument }); // immediate ack

  if (!valid || !intelConfig.stream.decisionEnabled) {
    send("decision-status", { state: "DISABLED", message: intelConfig.stream.decisionEnabled ? "Invalid or incomplete locked plan." : "Realtime decision stream disabled." });
    // Keep the connection open (client falls back to poll) with keepalive.
  }

  await ensureLoaded().catch(() => {});
  const ins = valid ? lookupByKey(instrument) : undefined;
  const token = ins?.instrumentToken ?? null;
  if (valid && token == null) send("decision-status", { state: "WARMING", instrument, message: "Instrument not in the Kite cache yet — using poll fallback." });

  // Cold-start seed (§3): one REST fetch warms the candle series so indicators have
  // history; thereafter updates are tick-driven. Best-effort (no-op without Kite).
  if (valid && token != null) await getLiveSignalWithData({ instrument, interval }).catch(() => {});

  // Keep the token streamed by the ticker (ref-counted) with a no-op tick sink.
  const tickHandle = valid ? registerClient([instrument], () => {}) : null;

  const plan: LockedPlan | null = valid
    ? {
        direction: direction as "LONG" | "SHORT",
        entry: entry!,
        safeLow: safeLow!,
        safeHigh: safeHigh!,
        stop: stop!,
        target1: target1!,
        target2: n(q.target2),
        invalidation: invalidation!,
        atr: n(q.atr),
        analysedCmp: n(q.analysedCmp) ?? entry!,
        analysedAtMs: n(q.analysedAtMs),
      }
    : null;
  const position: PositionInput | null =
    n(q.posEntry) != null && (q.posSide === "LONG" || q.posSide === "SHORT")
      ? { side: q.posSide as "LONG" | "SHORT", entryPrice: n(q.posEntry)!, stop: n(q.posStop) ?? stop!, target1: n(q.posTarget1) ?? target1!, invalidation: n(q.posInvalidation) ?? invalidation! }
      : null;

  let sessionId: number | null = null;
  if (valid && token != null && plan) {
    const created = createDecisionSession({ token, instrument, interval, plan, position }, send);
    sessionId = created.id;
    send("decision-status", { state: "SUBSCRIBED", instrument, interval });
    if (created.snapshot) send("decision", created.snapshot);
  }

  const keepalive = setInterval(() => send("ping", { t: Date.now() }), intelConfig.stream.sseKeepaliveMs);
  const cleanup = () => {
    clearInterval(keepalive);
    if (sessionId != null) removeDecisionSession(sessionId);
    if (tickHandle) unregisterClient(tickHandle.id);
  };
  req.on("close", cleanup);
  res.on("error", cleanup);
}
