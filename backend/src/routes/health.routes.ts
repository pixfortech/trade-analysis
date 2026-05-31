import { Router } from "express";
import { getHealth } from "../controllers/health.controller";

export const healthRouter = Router();

// GET /api/health
healthRouter.get("/", getHealth);
