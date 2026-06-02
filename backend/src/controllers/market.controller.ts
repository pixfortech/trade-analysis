import type { Request, Response } from "express";
import { buildHistory, buildQuote } from "../utils/mockData";
import { getChartData } from "../services/liveTradePlan.service";
import { parseActiveIndicators } from "../services/indicatorEngine";
import { KiteError } from "../services/kite.service";
import { getMarketStatus } from "../services/marketStatus";
import { getTopMovers, type MoverSegment } from "../services/topMovers";

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

/**
 * GET /api/market/chart-data — READ-ONLY live candles + indicator series.
 * Accepts instrument (exact or resolver params), interval and activeIndicators.
 */
export async function getChartDataHandler(req: Request, res: Response) {
  try {
    const data = await getChartData({
      instrument: req.query.instrument ? String(req.query.instrument) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike ? String(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
      interval: req.query.interval ? String(req.query.interval) : undefined,
      activeIndicators: parseActiveIndicators(req.query.activeIndicators ? String(req.query.activeIndicators) : undefined),
    });
    res.json({ source: "kite", live: true, readOnly: true, ...data });
  } catch (err) {
    if (err instanceof KiteError) {
      res.status(err.status).json({ error: { message: err.message, code: err.code }, readOnly: true });
      return;
    }
    console.error("[backend] chart-data unexpected error");
    res.status(500).json({ error: { message: "Unexpected chart-data error.", code: "CHART_INTERNAL" }, readOnly: true });
  }
}

/** GET /api/market/status — real NSE session state in IST. */
export function getStatus(_req: Request, res: Response) {
  res.json({ readOnly: true, ...getMarketStatus() });
}

/** GET /api/market/top-movers?segment=equity|indices|futures|options */
export async function getTopMoversHandler(req: Request, res: Response) {
  try {
    const seg = String(req.query.segment ?? "equity").toLowerCase();
    const valid: MoverSegment[] = ["equity", "indices", "futures", "options"];
    const segment = (valid.includes(seg as MoverSegment) ? seg : "equity") as MoverSegment;
    const result = await getTopMovers(segment);
    res.json({ readOnly: true, ...result });
  } catch (err) {
    if (err instanceof KiteError) {
      res.status(err.status).json({ error: { message: err.message, code: err.code }, readOnly: true });
      return;
    }
    console.error("[backend] top-movers unexpected error");
    res.status(500).json({ error: { message: "Unexpected top-movers error.", code: "MOVERS_INTERNAL" }, readOnly: true });
  }
}
