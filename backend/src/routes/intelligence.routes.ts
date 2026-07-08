import { Router } from "express";
import { getIntelligenceHandler, getMarketNewsHandler, getInstrumentNewsHandler, getVixHandler } from "../controllers/intelligence.controller";

// Combined market-intelligence + news + VIX (READ-ONLY, advisory).
export const intelligenceRouter = Router();
intelligenceRouter.get("/", getIntelligenceHandler); // GET /api/market-intelligence?instrument=...
intelligenceRouter.get("/vix", getVixHandler); // GET /api/market-intelligence/vix

export const newsRouter = Router();
newsRouter.get("/market", getMarketNewsHandler); // GET /api/news/market
newsRouter.get("/instrument", getInstrumentNewsHandler); // GET /api/news/instrument?symbol=RELIANCE
