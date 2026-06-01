import type { Request, Response } from "express";
import * as kite from "../services/kite.service";
import { KiteError } from "../services/kite.service";

// Phase 3A — READ-ONLY. These handlers expose status, the login flow, and
// market-data reads only. No order/trade endpoints exist here by design.

const READ_ONLY_NOTICE =
  "Read-only live market data. Order placement, modification, cancellation, GTT, baskets and trade execution are NOT supported in this app.";

/** Map service errors to clean JSON without leaking secrets. */
function handleError(res: Response, err: unknown) {
  if (err instanceof KiteError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code }, readOnly: true });
    return;
  }
  // Unknown error — keep the response generic.
  console.error("[kite] unexpected error");
  res.status(500).json({ error: { message: "Unexpected Kite error.", code: "KITE_INTERNAL" }, readOnly: true });
}

/** GET /api/kite/status — secret-free status for the UI. */
export function getStatus(_req: Request, res: Response) {
  res.json({ ...kite.getPublicStatus(), notice: READ_ONLY_NOTICE });
}

/** GET /api/kite/login-url — returns the hosted Kite login URL (public api_key only). */
export function getLoginUrl(_req: Request, res: Response) {
  try {
    res.json({ loginUrl: kite.buildLoginUrl(), readOnly: true });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/kite/callback?request_token=...&status=success
 * Kite redirects the browser here after login. We exchange the request_token
 * for an access token (server-side) and return a small confirmation.
 */
export async function handleCallback(req: Request, res: Response) {
  try {
    const requestToken = String(req.query.request_token ?? req.body?.request_token ?? "");
    await kite.generateSession(requestToken);
    // Do NOT echo the token. Just confirm.
    res.json({
      authenticated: true,
      readOnly: true,
      message: "Kite authorised for this session (read-only). You can close this tab and return to the dashboard.",
    });
  } catch (err) {
    handleError(res, err);
  }
}

/** POST /api/kite/logout — clear the server-side session. */
export function postLogout(_req: Request, res: Response) {
  kite.logout();
  res.json({ authenticated: false, readOnly: true, message: "Kite session cleared." });
}

/** GET /api/kite/quote?instrument=NSE:RELIANCE — live read-only quote. */
export async function getQuote(req: Request, res: Response) {
  try {
    const instrument = String(req.query.instrument ?? "");
    const data = await kite.getQuote(instrument);
    res.json({ source: "kite", live: true, readOnly: true, instrument, data });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/kite/historical?instrumentToken=738561&interval=day&from=...&to=...
 * Live read-only historical candles.
 */
export async function getHistorical(req: Request, res: Response) {
  try {
    const data = await kite.getHistorical({
      instrumentToken: String(req.query.instrumentToken ?? ""),
      interval: String(req.query.interval ?? "day"),
      from: String(req.query.from ?? ""),
      to: String(req.query.to ?? ""),
    });
    res.json({ source: "kite", live: true, readOnly: true, data });
  } catch (err) {
    handleError(res, err);
  }
}
