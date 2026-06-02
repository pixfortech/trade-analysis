import { Router } from "express";
import {
  getChartDataHandler,
  getHistory,
  getQuote,
  getStatus,
  getTopMoversHandler,
} from "../controllers/market.controller";

export const marketRouter = Router();

// GET /api/market/quote
marketRouter.get("/quote", getQuote);

// GET /api/market/history
marketRouter.get("/history", getHistory);

// GET /api/market/chart-data  (READ-ONLY live candles + indicator series)
marketRouter.get("/chart-data", getChartDataHandler);

// GET /api/market/status  (real NSE session state in IST)
marketRouter.get("/status", getStatus);

// GET /api/market/top-movers?segment=equity|indices|futures|options
marketRouter.get("/top-movers", getTopMoversHandler);
