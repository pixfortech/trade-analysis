import { Router } from "express";
import { getPublicConfigHandler } from "../controllers/config.controller";

// Public runtime config for the frontend (safe subset only — no secrets).
export const configRouter = Router();
configRouter.get("/public", getPublicConfigHandler); // GET /api/config/public
