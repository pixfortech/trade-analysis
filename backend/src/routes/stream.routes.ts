import { Router } from "express";
import { streamTicks, streamStatus, streamDecision } from "../controllers/stream.controller";

/** Real-time market-data relay (READ-ONLY). SSE tick stream + decision stream + status. */
export const streamRouter = Router();

streamRouter.get("/ticks", streamTicks);
streamRouter.get("/decision", streamDecision);
streamRouter.get("/status", streamStatus);
