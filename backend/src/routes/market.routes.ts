import { Router } from "express";
import { getHistory, getQuote } from "../controllers/market.controller";

export const marketRouter = Router();

// GET /api/market/quote
marketRouter.get("/quote", getQuote);

// GET /api/market/history
marketRouter.get("/history", getHistory);
