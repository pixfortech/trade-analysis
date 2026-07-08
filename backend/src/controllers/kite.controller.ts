import type { Request, Response } from "express";
import * as kite from "../services/kite.service";
import { KiteError } from "../services/kite.service";
import * as instruments from "../services/instruments.service";
import { resolveInstrumentInput, toCandidate } from "../services/resolveInput";
import { env, isProd } from "../config/env";

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

/** GET /api/kite/status — secret-free status for the UI. `authenticated` is
 *  VERIFIED against Kite (a stale/expired token reports authenticated:false). */
export async function getStatus(_req: Request, res: Response) {
  try {
    res.json({ ...(await kite.getVerifiedStatus()), notice: READ_ONLY_NOTICE });
  } catch {
    res.json({ ...kite.getPublicStatus(), notice: READ_ONLY_NOTICE });
  }
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
 * Public URL of the frontend/dashboard. The Kite login tab is redirected here
 * (to /kite/connected) after the callback so it lands on the SAME origin as the
 * dashboard, where BroadcastChannel/localStorage signalling works. Prefers the
 * FRONTEND_URL env var, then the first configured CORS origin (dev), then a safe
 * default (localhost in dev, the deployed Firebase site in prod).
 */
function frontendBaseUrl(): string {
  if (env.frontendUrl) return env.frontendUrl.replace(/\/+$/, "");
  if (!isProd) return (env.corsOrigin[0] ?? "http://localhost:3000").replace(/\/+$/, "");
  return "https://trade-analysis-ai-engine.web.app";
}

/** Build the frontend "connected" URL (same origin as the dashboard). */
function connectedUrl(status: "success" | "error", reason?: string): string {
  const u = new URL("/kite/connected/", `${frontendBaseUrl()}/`);
  u.searchParams.set("status", status);
  if (reason) u.searchParams.set("reason", reason.slice(0, 200));
  return u.toString();
}

/** Minimal HTML escaping for values interpolated into the callback page. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/**
 * Self-contained callback page. Its job is to hand the browser back to the
 * frontend "connected" route (same origin as the dashboard) via an immediate
 * redirect, with a visible "Return to Dashboard" fallback if the redirect is
 * blocked. No secrets are ever included.
 */
function callbackHtml(kind: "success" | "error", target: string, message?: string): string {
  const heading = kind === "success" ? "Kite connected" : "Kite connection failed";
  const sub = kind === "success" ? "Returning you to the dashboard…" : esc(message ?? "Please return to the dashboard and try again.");
  const accent = kind === "success" ? "#2bd48f" : "#f7a957";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<title>${esc(heading)}</title>
<style>
  html,body{margin:0;height:100%;background:#0a0e17;color:#e5e9f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;width:100%;background:#111726;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:28px;text-align:center}
  h1{font-size:18px;margin:0 0 8px;color:${accent}}
  p{font-size:14px;line-height:1.5;color:#9aa5b8;margin:0 0 20px}
  a.btn{display:inline-block;background:#2f6fed;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:9px}
  .ro{margin-top:16px;font-size:11px;color:#5d6b82}
</style></head><body><div class="wrap"><main class="card">
  <h1>${kind === "success" ? "✓ " : "⚠ "}${esc(heading)}</h1>
  <p>${sub}</p>
  <a class="btn" href="${esc(target)}">Return to Dashboard</a>
  <div class="ro">Read-only market-data access. No order placement.</div>
</main></div>
<script>try{window.location.replace(${JSON.stringify(target)});}catch(e){}</script>
</body></html>`;
}

/**
 * GET /api/kite/callback?request_token=...&status=success
 * Kite redirects the browser here after login. We exchange the request_token
 * for an access token (server-side, never echoed), then redirect the tab to the
 * frontend /kite/connected route so it can signal the dashboard and auto-close.
 */
export async function handleCallback(req: Request, res: Response) {
  try {
    const requestToken = String(req.query.request_token ?? req.body?.request_token ?? "");
    await kite.generateSession(requestToken);
    // Token stored server-side only. Hand off to the same-origin frontend route.
    res.status(200).type("html").send(callbackHtml("success", connectedUrl("success")));
  } catch (err) {
    // Even on failure, guide the user back to the dashboard with a clear message.
    const message = err instanceof KiteError ? err.message : "Kite authorisation failed. Please try connecting again.";
    res.status(200).type("html").send(callbackHtml("error", connectedUrl("error", message), message));
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

/**
 * GET /api/kite/quotes?instruments=NSE:RELIANCE,NFO:MIDCPNIFTY26JUNFUT
 * Batch read-only quotes for the watchlist / dashboard cards. Invalid or
 * unknown instruments are reported in `missing` rather than failing the call.
 */
export async function getQuotes(req: Request, res: Response) {
  try {
    const raw = String(req.query.instruments ?? "");
    const requested = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (requested.length === 0) {
      res.status(400).json({ error: { message: "Provide ?instruments=EXCH:SYM,EXCH:SYM", code: "KITE_BAD_REQUEST" }, readOnly: true });
      return;
    }
    const data = await kite.getQuotes(requested);
    const missing = requested.filter((i) => !(i in data));
    res.json({ source: "kite", live: true, readOnly: true, requested, missing, data });
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

/**
 * GET /api/kite/instruments/search — Zerodha-like grouped search.
 * q can be free text like "NIFTY 24500 CE", "MIDCPNIFTY FUT", "RELIANCE".
 * Optional filters: segment (equity|indices|futures|options|all), underlying,
 * instrumentType, expiry, strike, optionType, limit (per group).
 */
export async function searchInstruments(req: Request, res: Response) {
  try {
    const groups = await instruments.searchGrouped({
      q: req.query.q ? String(req.query.q) : undefined,
      segment: req.query.segment ? String(req.query.segment) : undefined,
      underlying: req.query.underlying ? String(req.query.underlying) : undefined,
      instrumentType: req.query.instrumentType ? String(req.query.instrumentType) : undefined,
      expiry: req.query.expiry ? String(req.query.expiry) : undefined,
      strike: req.query.strike != null && req.query.strike !== "" ? Number(req.query.strike) : undefined,
      optionType: req.query.optionType ? String(req.query.optionType) : undefined,
      limitPerGroup: req.query.limit ? Number(req.query.limit) : undefined,
    });
    const status = instruments.getCacheStatus();
    const total = groups.equity.length + groups.indices.length + groups.futures.length + groups.options.length;
    res.json({
      readOnly: true,
      query: req.query.q ? String(req.query.q) : "",
      cache: { ready: status.ready, lastUpdated: status.loadedAt, expiresAt: status.expiresAt, count: status.count },
      groups,
      message: total === 0 ? "No matches. Refine your search or refresh the instruments cache." : "",
    });
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
