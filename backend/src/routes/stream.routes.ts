import { Router } from "express";
import { streamTicks, streamStatus } from "../controllers/stream.controller";

/** Real-time market-data relay (READ-ONLY). SSE tick stream + status probe. */
export const streamRouter = Router();

streamRouter.get("/ticks", streamTicks);
streamRouter.get("/status", streamStatus);
