import { Router } from "express";
import {
  getHistorical,
  getInstrumentsStatus,
  getLoginUrl,
  getOptionExpiriesHandler,
  getOptionsChainHandler,
  getQuote,
  getQuotes,
  getStatus,
  handleCallback,
  postLogout,
  refreshInstruments,
  resolveInstrument,
  searchInstruments,
} from "../controllers/kite.controller";

// Phase 3A/3C — READ-ONLY Zerodha Kite Connect routes.
// Status, login flow, market-data reads and the instruments resolver only.
// No trade/order routes.
export const kiteRouter = Router();

// GET /api/kite/status
kiteRouter.get("/status", getStatus);

// GET /api/kite/login-url
kiteRouter.get("/login-url", getLoginUrl);

// GET /api/kite/callback
kiteRouter.get("/callback", handleCallback);

// POST /api/kite/logout  (clears server-side session; not a trade action)
kiteRouter.post("/logout", postLogout);

// --- Instruments resolver (Phase 3C) ---
// GET /api/kite/instruments/status
kiteRouter.get("/instruments/status", getInstrumentsStatus);
// POST /api/kite/instruments/refresh
kiteRouter.post("/instruments/refresh", refreshInstruments);
// GET /api/kite/instruments/search?q=MIDCPNIFTY&segment=NFO&instrumentType=FUT
kiteRouter.get("/instruments/search", searchInstruments);
// GET /api/kite/instruments/resolve?underlying=MIDCPNIFTY&instrumentType=FUT&expiry=…
kiteRouter.get("/instruments/resolve", resolveInstrument);

// GET /api/kite/quote?instrument=NSE:RELIANCE  (or resolver params)
kiteRouter.get("/quote", getQuote);

// GET /api/kite/quotes?instruments=NSE:RELIANCE,NFO:MIDCPNIFTY26JUNFUT  (batch)
kiteRouter.get("/quotes", getQuotes);

// GET /api/kite/option-expiries?underlying=NIFTY
kiteRouter.get("/option-expiries", getOptionExpiriesHandler);

// GET /api/kite/options-chain?underlying=NIFTY&expiry=YYYY-MM-DD&strikes=12
kiteRouter.get("/options-chain", getOptionsChainHandler);

// GET /api/kite/historical?instrumentToken=...&interval=day&from=...&to=...
kiteRouter.get("/historical", getHistorical);
