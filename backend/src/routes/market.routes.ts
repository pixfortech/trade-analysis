import { Router } from "express";
import { getChartDataHandler, getHistory, getQuote } from "../controllers/market.controller";

export const marketRouter = Router();

// GET /api/market/quote
marketRouter.get("/quote", getQuote);

// GET /api/market/history
marketRouter.get("/history", getHistory);

// GET /api/market/chart-data  (READ-ONLY live candles + indicator series)
marketRouter.get("/chart-data", getChartDataHandler);
