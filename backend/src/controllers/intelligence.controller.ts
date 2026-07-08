import type { Request, Response } from "express";
import { getMarketIntelligence } from "../services/marketIntelligence.service";
import { getMarketNews, getInstrumentNews } from "../services/news.service";
import { getVix } from "../services/vix.service";
import { KiteError } from "../services/kite.service";

const READ_ONLY = "Advisory market intelligence — read-only. No order placement, modification or execution.";

function handleError(res: Response, err: unknown) {
  if (err instanceof KiteError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code }, readOnly: true });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected error.";
  res.status(500).json({ error: { message, code: "INTELLIGENCE_ERROR" }, readOnly: true });
}

/** GET /api/market-intelligence — combined technical + VIX + news + breadth. */
export async function getIntelligenceHandler(req: Request, res: Response) {
  try {
    const result = await getMarketIntelligence({
      instrument: req.query.instrument ? String(req.query.instrument) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike ? String(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
      interval: req.query.interval ? String(req.query.interval) : undefined,
      riskProfile: req.query.riskProfile ? String(req.query.riskProfile) : undefined,
    });
    res.json({ ...result, notice: READ_ONLY });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/news/market — market-wide headlines with sentiment. */
export async function getMarketNewsHandler(_req: Request, res: Response) {
  try {
    res.json(await getMarketNews());
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/news/instrument?symbol=RELIANCE — headlines mentioning the symbol. */
export async function getInstrumentNewsHandler(req: Request, res: Response) {
  try {
    const symbol = String(req.query.symbol ?? "").trim();
    if (!symbol) {
      res.status(400).json({ error: { message: "Provide ?symbol=", code: "BAD_REQUEST" }, readOnly: true });
      return;
    }
    res.json(await getInstrumentNews(symbol));
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/market-intelligence/vix — India VIX value + interpretation. */
export async function getVixHandler(_req: Request, res: Response) {
  try {
    res.json(await getVix());
  } catch (err) {
    handleError(res, err);
  }
}
