import type { Request, Response } from "express";
import { callAiEngine } from "../services/aiEngine.service";
import { KiteError } from "../services/kite.service";
import { getLiveTradePlan, getLiveSignal, getActiveTradeMonitor } from "../services/liveTradePlan.service";
import { getDecision, type PositionInput } from "../services/decisionEngine.service";
import { parseActiveIndicators } from "../services/indicatorEngine";
import type { AnalysisResponse, TradePlanResponse } from "../types/contracts";
import { mockAnalysis, mockTradePlan } from "../utils/mockData";

/** Shared: map a thrown error (incl. KiteError w/ candidates) to a clean response. */
function sendAnalysisError(res: Response, err: unknown, label: string) {
  if (err instanceof KiteError) {
    const body: Record<string, unknown> = { error: { message: err.message, code: err.code }, readOnly: true };
    const candidates = (err as KiteError & { candidates?: unknown }).candidates;
    if (candidates) body.candidates = candidates;
    res.status(err.status).json(body);
    return;
  }
  console.error(`[backend] ${label} unexpected error`);
  res.status(500).json({ error: { message: "Unexpected analysis error.", code: "ANALYSIS_INTERNAL" }, readOnly: true });
}

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

/**
 * GET /api/analysis/live-trade-plan?instrument=NSE:RELIANCE&interval=5minute&riskProfile=balanced
 * READ-ONLY: live Kite quote + historical candles → long/short levels.
 * Errors from the Kite layer (disabled/login-required) are surfaced cleanly
 * without leaking any secret.
 */
export async function getLiveTradePlanHandler(req: Request, res: Response) {
  try {
    const result = await getLiveTradePlan({
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
    res.json(result);
  } catch (err) {
    sendAnalysisError(res, err, "live-trade-plan");
  }
}

/**
 * GET /api/analysis/live-signal — READ-ONLY live market signal.
 * Accepts exact instrument OR F&O resolver params, plus interval & riskProfile.
 * Returns trend, bullish/bearish probability, estimated win %, long/short
 * setups (entry/SL/targets/exits), risk-reward and tentative P/L per lot.
 */
export async function getLiveSignalHandler(req: Request, res: Response) {
  try {
    const result = await getLiveSignal({
      instrument: req.query.instrument ? String(req.query.instrument) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike ? String(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
      interval: req.query.interval ? String(req.query.interval) : undefined,
      riskProfile: req.query.riskProfile ? String(req.query.riskProfile) : undefined,
      activeIndicators: parseActiveIndicators(req.query.activeIndicators ? String(req.query.activeIndicators) : undefined),
      quantity: req.query.quantity ? Number(req.query.quantity) : null,
    });
    res.json(result);
  } catch (err) {
    sendAnalysisError(res, err, "live-signal");
  }
}

/**
 * GET /api/analysis/active-trade-monitor — READ-ONLY position monitor.
 * Required: positionDirection (LONG|SHORT), entryPrice, quantity, plus an
 * instrument (exact or resolver params). Advisory only; never executes.
 */
export async function getActiveTradeMonitorHandler(req: Request, res: Response) {
  try {
    const dir = String(req.query.positionDirection ?? "").toUpperCase();
    if (dir !== "LONG" && dir !== "SHORT") {
      res.status(400).json({ error: { message: "positionDirection must be LONG or SHORT.", code: "BAD_DIRECTION" }, readOnly: true });
      return;
    }
    const entryPrice = Number(req.query.entryPrice);
    const quantity = Number(req.query.quantity);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      res.status(400).json({ error: { message: "entryPrice must be a positive number.", code: "BAD_ENTRY" }, readOnly: true });
      return;
    }
    const result = await getActiveTradeMonitor({
      positionDirection: dir,
      entryPrice,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      instrument: req.query.instrument ? String(req.query.instrument) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike ? String(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
      interval: req.query.interval ? String(req.query.interval) : undefined,
      riskProfile: req.query.riskProfile ? String(req.query.riskProfile) : undefined,
      activeIndicators: parseActiveIndicators(req.query.activeIndicators ? String(req.query.activeIndicators) : undefined),
    });
    res.json(result);
  } catch (err) {
    sendAnalysisError(res, err, "active-trade-monitor");
  }
}

/**
 * GET /api/analysis/decision — one tick of the real-time DECISION LOOP.
 * READ-ONLY: continuous, stateful ENTER/WAIT/HOLD/EXIT/AVOID/NO ACTION with
 * regime, specialised setups, conflicts, separate scores, a state machine and
 * an audit trail. Optional position params (positionDirection/entryPrice/
 * quantity/stopLoss/targets) switch it into HOLD/EXIT management. Advisory only.
 */
export async function getDecisionHandler(req: Request, res: Response) {
  try {
    let position: PositionInput | undefined;
    const dir = String(req.query.positionDirection ?? "").toUpperCase();
    const entryPrice = Number(req.query.entryPrice);
    if ((dir === "LONG" || dir === "SHORT") && Number.isFinite(entryPrice) && entryPrice > 0) {
      const targets = String(req.query.targets ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const sl = Number(req.query.stopLoss);
      position = {
        direction: dir,
        entryPrice,
        quantity: Number.isFinite(Number(req.query.quantity)) ? Number(req.query.quantity) : undefined,
        stopLoss: Number.isFinite(sl) && sl > 0 ? sl : null,
        targets: targets.length ? targets : undefined,
      };
    }
    const result = await getDecision({
      instrument: req.query.instrument ? String(req.query.instrument) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike ? String(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
      interval: req.query.interval ? String(req.query.interval) : undefined,
      riskProfile: req.query.riskProfile ? String(req.query.riskProfile) : undefined,
      position,
    });
    res.json(result);
  } catch (err) {
    sendAnalysisError(res, err, "decision");
  }
}
