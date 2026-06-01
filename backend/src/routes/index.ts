import { Router } from "express";
import { healthRouter } from "./health.routes";
import { marketRouter } from "./market.routes";
import { analysisRouter } from "./analysis.routes";
import { kiteRouter } from "./kite.routes";

export const router = Router();

router.use("/health", healthRouter);
router.use("/market", marketRouter);
router.use("/analysis", analysisRouter);
router.use("/kite", kiteRouter);
