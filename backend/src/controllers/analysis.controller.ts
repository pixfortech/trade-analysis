import type { Request, Response } from "express";
import { callAiEngine } from "../services/aiEngine.service";
import type { AnalysisResponse, TradePlanResponse } from "../types/contracts";
import { mockAnalysis, mockTradePlan } from "../utils/mockData";

/**
 * Analysis handlers proxy to the Python AI engine via the service layer.
 * If the engine is unavailable, they fall back to local mock data (clearly
 * marked `source: "mock-fallback"`) so the API stays runnable in any setup.
 * No real market data or AI is involved yet (Phase 2 — mock/demo only).
 */

async function proxyAnalysis(
  res: Response,
  enginePath: string,
  payload: Record<string, unknown>,
  fallback: () => AnalysisResponse,
) {
  try {
    const data = await callAiEngine<AnalysisResponse>(enginePath, payload);
    res.json({ ...data, source: "ai-engine", demo: true });
  } catch (err) {
    console.warn(`[backend] AI engine fallback for ${enginePath}: ${(err as Error).message}`);
    res.json({ ...fallback(), source: "mock-fallback" });
  }
}

/** POST /api/analysis/technical → AI engine /analyse/equity */
export function postTechnical(req: Request, res: Response) {
  const { symbol = "NIFTY", segment = "equity", interval = "1d" } = req.body ?? {};
  return proxyAnalysis(res, "/analyse/equity", { symbol, interval }, () =>
    mockAnalysis(String(symbol), String(segment)),
  );
}

/** POST /api/analysis/futures → AI engine /analyse/futures */
export function postFutures(req: Request, res: Response) {
  const { symbol = "NIFTY", expiry } = req.body ?? {};
  return proxyAnalysis(res, "/analyse/futures", { symbol, expiry }, () =>
    mockAnalysis(String(symbol), "index_future"),
  );
}

/** POST /api/analysis/options → AI engine /analyse/options */
export function postOptions(req: Request, res: Response) {
  const { symbol = "NIFTY", expiry } = req.body ?? {};
  return proxyAnalysis(res, "/analyse/options", { symbol, expiry }, () =>
    mockAnalysis(String(symbol), "index_option"),
  );
}

/** POST /api/analysis/trade-plan → AI engine /analyse/trade-plan */
export async function postTradePlan(req: Request, res: Response) {
  const { symbol = "RELIANCE", segment = "equity", capital = 100000, riskPercent = 1 } = req.body ?? {};
  try {
    const data = await callAiEngine<TradePlanResponse>("/analyse/trade-plan", {
      symbol,
      segment,
      capital,
      riskPercent,
    });
    res.json({ ...data, source: "ai-engine", demo: true });
  } catch (err) {
    console.warn(`[backend] AI engine fallback for /analyse/trade-plan: ${(err as Error).message}`);
    res.json({ ...mockTradePlan({ symbol: String(symbol), segment: String(segment) }), source: "mock-fallback" });
  }
}
