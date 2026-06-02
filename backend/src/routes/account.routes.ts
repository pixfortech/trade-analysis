import { Router } from "express";
import {
  getFunds,
  getHoldings,
  getMargins,
  getPortfolioSummary,
  getPositions,
  getProfile,
} from "../controllers/account.controller";

// Phase 3G — READ-ONLY Zerodha account routes (no order/execution).
export const accountRouter = Router();

accountRouter.get("/profile", getProfile);
accountRouter.get("/funds", getFunds);
accountRouter.get("/margins", getMargins);
accountRouter.get("/holdings", getHoldings);
accountRouter.get("/positions", getPositions);
accountRouter.get("/portfolio-summary", getPortfolioSummary);
