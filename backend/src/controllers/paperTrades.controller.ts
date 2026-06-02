import type { Request, Response } from "express";
import * as paper from "../services/paperTrades";
import * as kite from "../services/kite.service";

// Phase 3G — SIMULATED paper trading. NEVER calls a Kite order endpoint.
// Live quotes are used only for mark-to-market. All P/L is simulated.

const DISCLAIMER =
  "Simulated paper trading only — no real orders are placed. P/L is an estimate using live prices.";

/** Best-effort live prices for the given instruments (empty map if unavailable). */
async function livePrices(keys: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (keys.length === 0) return map;
  try {
    const data = await kite.getQuotes(keys);
    for (const [key, q] of Object.entries(data)) {
      const lp = (q as Record<string, unknown>).last_price;
      if (typeof lp === "number") map.set(key, lp);
    }
  } catch {
    /* live data unavailable — views fall back to no current price */
  }
  return map;
}

async function viewsWithPrices() {
  const trades = paper.listTrades();
  const prices = await livePrices(paper.openInstrumentKeys());
  return trades.map((t) => paper.toView(t, prices));
}

/** POST /api/paper-trades/open */
export async function open(req: Request, res: Response) {
  const b = req.body ?? {};
  const direction = String(b.direction ?? "").toUpperCase();
  if (direction !== "LONG" && direction !== "SHORT") {
    res.status(400).json({ error: { message: "direction must be LONG or SHORT.", code: "BAD_DIRECTION" } });
    return;
  }
  const entryPrice = Number(b.entryPrice);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    res.status(400).json({ error: { message: "entryPrice must be a positive number.", code: "BAD_ENTRY" } });
    return;
  }
  if (!b.instrumentKey || typeof b.instrumentKey !== "string") {
    res.status(400).json({ error: { message: "instrumentKey is required.", code: "BAD_INSTRUMENT" } });
    return;
  }
  const trade = paper.openTrade({
    instrumentKey: b.instrumentKey,
    displayName: b.displayName,
    direction,
    entryPrice,
    quantity: b.quantity != null ? Number(b.quantity) : undefined,
    lotSize: b.lotSize != null ? Number(b.lotSize) : undefined,
    lots: b.lots != null ? Number(b.lots) : undefined,
    stopLoss: b.stopLoss != null ? Number(b.stopLoss) : null,
    targets: Array.isArray(b.targets) ? b.targets.map(Number) : [],
    notes: b.notes ? String(b.notes) : "",
  });
  res.json({ readOnly: true, simulated: true, trade, disclaimer: DISCLAIMER });
}

/** POST /api/paper-trades/close { id, exitPrice? } — exitPrice defaults to live. */
export async function close(req: Request, res: Response) {
  const id = String(req.body?.id ?? "");
  let exitPrice = Number(req.body?.exitPrice);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    const t = paper.listTrades().find((x) => x.id === id);
    if (t) {
      const prices = await livePrices([t.instrumentKey]);
      exitPrice = prices.get(t.instrumentKey) ?? t.entryPrice;
    }
  }
  const trade = paper.closeTrade(id, exitPrice);
  if (!trade) {
    res.status(404).json({ error: { message: "Paper trade not found.", code: "NOT_FOUND" } });
    return;
  }
  res.json({ readOnly: true, simulated: true, trade, disclaimer: DISCLAIMER });
}

/** POST /api/paper-trades/partial-close { id, quantity, exitPrice? } */
export async function partialClose(req: Request, res: Response) {
  const id = String(req.body?.id ?? "");
  const qty = Number(req.body?.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    res.status(400).json({ error: { message: "quantity must be a positive number.", code: "BAD_QTY" } });
    return;
  }
  let exitPrice = Number(req.body?.exitPrice);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    const t = paper.listTrades().find((x) => x.id === id);
    if (t) {
      const prices = await livePrices([t.instrumentKey]);
      exitPrice = prices.get(t.instrumentKey) ?? t.entryPrice;
    }
  }
  const trade = paper.partialClose(id, exitPrice, qty);
  if (!trade) {
    res.status(404).json({ error: { message: "Paper trade not found.", code: "NOT_FOUND" } });
    return;
  }
  res.json({ readOnly: true, simulated: true, trade, disclaimer: DISCLAIMER });
}

/** GET /api/paper-trades */
export async function list(_req: Request, res: Response) {
  const views = await viewsWithPrices();
  res.json({ readOnly: true, simulated: true, trades: views, disclaimer: DISCLAIMER });
}

/** GET /api/paper-trades/summary */
export async function getSummary(_req: Request, res: Response) {
  const views = await viewsWithPrices();
  res.json({ readOnly: true, simulated: true, summary: paper.summary(views), disclaimer: DISCLAIMER });
}

/** DELETE /api/paper-trades/reset */
export function reset(_req: Request, res: Response) {
  paper.reset();
  res.json({ readOnly: true, simulated: true, reset: true, disclaimer: DISCLAIMER });
}
