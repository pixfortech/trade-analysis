import { Router } from "express";
import {
  getHistorical,
  getLoginUrl,
  getQuote,
  getStatus,
  handleCallback,
  postLogout,
} from "../controllers/kite.controller";

// Phase 3A — READ-ONLY Zerodha Kite Connect routes.
// Status, login flow and market-data reads only. No trade/order routes.
export const kiteRouter = Router();

// GET /api/kite/status
kiteRouter.get("/status", getStatus);

// GET /api/kite/login-url
kiteRouter.get("/login-url", getLoginUrl);

// GET /api/kite/callback
kiteRouter.get("/callback", handleCallback);

// POST /api/kite/logout  (clears server-side session; not a trade action)
kiteRouter.post("/logout", postLogout);

// GET /api/kite/quote?instrument=NSE:RELIANCE
kiteRouter.get("/quote", getQuote);

// GET /api/kite/historical?instrumentToken=...&interval=day&from=...&to=...
kiteRouter.get("/historical", getHistorical);
