import { Router } from "express";
import {
  close,
  getSummary,
  list,
  open,
  partialClose,
  reset,
} from "../controllers/paperTrades.controller";

// Phase 3G — SIMULATED paper trading. No real order endpoints are ever called.
export const paperTradesRouter = Router();

paperTradesRouter.get("/", list);
paperTradesRouter.get("/summary", getSummary);
paperTradesRouter.post("/open", open);
paperTradesRouter.post("/close", close);
paperTradesRouter.post("/partial-close", partialClose);
paperTradesRouter.delete("/reset", reset);
