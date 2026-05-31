import type { Request, Response } from "express";
import { buildHistory, buildQuote } from "../utils/mockData";

/** GET /api/market/quote?symbol=RELIANCE&segment=equity */
export function getQuote(req: Request, res: Response) {
  const symbol = String(req.query.symbol ?? "RELIANCE");
  const segment = String(req.query.segment ?? "equity");
  res.json({ source: "mock", data: buildQuote(symbol, segment) });
}

/** GET /api/market/history?symbol=NIFTY&interval=1d&limit=50 */
export function getHistory(req: Request, res: Response) {
  const symbol = String(req.query.symbol ?? "NIFTY");
  const interval = String(req.query.interval ?? "1d");
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
  res.json({ source: "mock", ...buildHistory(symbol, interval, limit) });
}
