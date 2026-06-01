import type { Request, Response } from "express";
import * as kite from "../services/kite.service";
import { KiteError } from "../services/kite.service";
import * as instruments from "../services/instruments.service";
import { resolveInstrumentInput, toCandidate } from "../services/resolveInput";

// Phase 3A/3C — READ-ONLY. Status, login flow, market-data reads and the
// instruments resolver only. No order/trade endpoints exist here by design.

const READ_ONLY_NOTICE =
  "Read-only live market data. Order placement, modification, cancellation, GTT, baskets and trade execution are NOT supported in this app.";

/** Map service errors to clean JSON without leaking secrets. */
function handleError(res: Response, err: unknown) {
  if (err instanceof KiteError) {
    const body: Record<string, unknown> = {
      error: { message: err.message, code: err.code },
      readOnly: true,
    };
    // Resolver errors may carry candidate suggestions (no secrets).
    const candidates = (err as KiteError & { candidates?: unknown }).candidates;
    if (candidates) body.candidates = candidates;
    res.status(err.status).json(body);
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

/**
 * GET /api/kite/quote — live read-only quote.
 * Accepts EITHER an exact `instrument=EXCHANGE:TRADINGSYMBOL` OR resolver params
 * (underlying, segment, instrumentType, expiry, strike, optionType).
 */
export async function getQuote(req: Request, res: Response) {
  try {
    const resolved = await resolveInstrumentInput({
      instrument: req.query.instrument ? String(req.query.instrument) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike ? String(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
    });
    const data = await kite.getQuote(resolved.instrument);
    res.json({
      source: "kite",
      live: true,
      readOnly: true,
      instrument: resolved.instrument,
      resolved,
      data,
    });
  } catch (err) {
    handleError(res, err);
  }
}

// --------------------------- Instruments (Phase 3C) ---------------------------

/** GET /api/kite/instruments/status — cache status & counts (no secrets). */
export function getInstrumentsStatus(_req: Request, res: Response) {
  res.json({ ...instruments.getCacheStatus(), notice: READ_ONLY_NOTICE });
}

/** POST /api/kite/instruments/refresh — (re)download the instruments dump. */
export async function refreshInstruments(req: Request, res: Response) {
  try {
    const segment = req.query.segment ? String(req.query.segment) : undefined;
    const count = await instruments.refreshCache(segment);
    res.json({ ...instruments.getCacheStatus(), refreshed: true, count });
  } catch (err) {
    handleError(res, err);
  }
}

/** GET /api/kite/instruments/search?q=MIDCPNIFTY&segment=NFO&instrumentType=FUT */
export async function searchInstruments(req: Request, res: Response) {
  try {
    const results = await instruments.search({
      q: req.query.q ? String(req.query.q) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ readOnly: true, count: results.length, results: results.map(toCandidate) });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/kite/instruments/resolve?underlying=MIDCPNIFTY&instrumentType=FUT&expiry=…
 * Resolves to one exact contract, or returns sorted candidates + guidance.
 */
export async function resolveInstrument(req: Request, res: Response) {
  try {
    const result = await instruments.resolve({
      underlying: String(req.query.underlying ?? ""),
      segment: req.query.segment ? String(req.query.segment) : undefined,
      instrumentType: String(req.query.instrumentType ?? ""),
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike != null && req.query.strike !== "" ? Number(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
    });
    res.json({
      readOnly: true,
      resolved: result.resolved ? toCandidate(result.resolved) : null,
      candidates: result.candidates.map(toCandidate),
      message: result.message,
    });
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
