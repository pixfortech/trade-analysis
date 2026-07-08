import { Router } from "express";
import { healthRouter } from "./health.routes";
import { marketRouter } from "./market.routes";
import { analysisRouter } from "./analysis.routes";
import { kiteRouter } from "./kite.routes";
import { accountRouter } from "./account.routes";
import { paperTradesRouter } from "./paperTrades.routes";
import { intelligenceRouter, newsRouter } from "./intelligence.routes";

export const router = Router();

router.use("/health", healthRouter);
router.use("/market", marketRouter);
router.use("/analysis", analysisRouter);
router.use("/kite", kiteRouter);
router.use("/kite/account", accountRouter);
router.use("/paper-trades", paperTradesRouter);
router.use("/market-intelligence", intelligenceRouter);
router.use("/news", newsRouter);
