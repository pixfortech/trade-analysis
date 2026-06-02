import { Router } from "express";
import {
  getActiveTradeMonitorHandler,
  getLiveSignalHandler,
  getLiveTradePlanHandler,
  postFutures,
  postOptions,
  postTechnical,
  postTradePlan,
} from "../controllers/analysis.controller";

export const analysisRouter = Router();

// POST /api/analysis/technical
analysisRouter.post("/technical", postTechnical);

// POST /api/analysis/futures
analysisRouter.post("/futures", postFutures);

// POST /api/analysis/options
analysisRouter.post("/options", postOptions);

// POST /api/analysis/trade-plan
analysisRouter.post("/trade-plan", postTradePlan);

// GET /api/analysis/live-trade-plan  (READ-ONLY, live Kite data)
analysisRouter.get("/live-trade-plan", getLiveTradePlanHandler);

// GET /api/analysis/live-signal  (READ-ONLY: trend, probability, setups, P/L)
analysisRouter.get("/live-signal", getLiveSignalHandler);

// GET /api/analysis/active-trade-monitor  (READ-ONLY advisory position monitor)
analysisRouter.get("/active-trade-monitor", getActiveTradeMonitorHandler);
