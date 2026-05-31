import type { Request, Response } from "express";
import {
  DISCLAIMER,
  buildFutures,
  buildOptions,
  buildTechnical,
  buildTradePlan,
} from "../utils/mockData";

/**
 * In later phases these handlers will forward to the Python AI engine
 * (env.aiEngineUrl) and return its structured analysis. For now they
 * return deterministic placeholder data so the API is runnable.
 */

/** POST /api/analysis/technical */
export function postTechnical(req: Request, res: Response) {
  const { symbol = "NIFTY" } = req.body ?? {};
  res.json({ source: "mock", ...buildTechnical(String(symbol)), disclaimer: DISCLAIMER });
}

/** POST /api/analysis/futures */
export function postFutures(req: Request, res: Response) {
  const { symbol = "NIFTY", expiry } = req.body ?? {};
  res.json({ source: "mock", ...buildFutures(String(symbol), expiry), disclaimer: DISCLAIMER });
}

/** POST /api/analysis/options */
export function postOptions(req: Request, res: Response) {
  const { symbol = "NIFTY", expiry } = req.body ?? {};
  res.json({ source: "mock", ...buildOptions(String(symbol), expiry), disclaimer: DISCLAIMER });
}

/** POST /api/analysis/trade-plan */
export function postTradePlan(req: Request, res: Response) {
  const { symbol = "RELIANCE", segment, capital, riskPercent } = req.body ?? {};
  res.json({
    source: "mock",
    ...buildTradePlan({ symbol: String(symbol), segment, capital, riskPercent }),
    disclaimer: DISCLAIMER,
  });
}
