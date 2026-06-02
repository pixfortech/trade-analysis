// =====================================================================
// Zerodha Kite Connect — service layer (Phase 3A, READ-ONLY)
// ---------------------------------------------------------------------
// SECURITY CONTRACT
//   • KITE_API_SECRET and the access token live ONLY in this service /
//     server process. They are never returned to the frontend and never
//     logged. `getPublicStatus()` deliberately exposes booleans only.
//   • This module performs READ-ONLY calls (quotes, historical candles).
//     It contains NO order placement / modification / cancellation / GTT /
//     basket / execution code, by design and policy.
//   • If KITE_ENABLE_LIVE_DATA is false, no network call to Kite is made.
//
// Implemented with native fetch + node:crypto — no extra dependencies.
// Kite Connect v3 reference: https://kite.trade/docs/connect/v3/
// =====================================================================

import { createHash } from "node:crypto";
import { env } from "../config/env";

const KITE_API_VERSION = "3";

/** In-memory, server-side access token. Never persisted to the repo, never sent to the client. */
let accessToken: string | null = env.kite.accessToken ? env.kite.accessToken : null;

export interface KitePublicStatus {
  provider: "zerodha-kite";
  liveDataEnabled: boolean;
  configured: boolean; // apiKey + apiSecret present
  authenticated: boolean; // an access token is held server-side
  readOnly: true;
  mode: "live" | "disabled";
  message: string;
}

/** Typed error so controllers can map to clean HTTP responses without leaking secrets. */
export class KiteError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "KITE_ERROR") {
    super(message);
    this.name = "KiteError";
    this.status = status;
    this.code = code;
  }
}

export function isLiveDataEnabled(): boolean {
  return env.kite.enableLiveData;
}

export function isConfigured(): boolean {
  return Boolean(env.kite.apiKey && env.kite.apiSecret);
}

export function hasAccessToken(): boolean {
  return Boolean(accessToken);
}

/** Public, secret-free status for the frontend status card. */
export function getPublicStatus(): KitePublicStatus {
  const liveDataEnabled = isLiveDataEnabled();
  const configured = isConfigured();
  const authenticated = hasAccessToken();

  let message: string;
  if (!liveDataEnabled) {
    message = "Live Kite data is disabled (set KITE_ENABLE_LIVE_DATA=true to enable). Using mock data elsewhere.";
  } else if (!configured) {
    message = "Kite live data is enabled but not configured. Set KITE_API_KEY and KITE_API_SECRET in backend/.env.";
  } else if (!authenticated) {
    message = "Login required. Open the Kite login URL to authorise read-only access for today's session.";
  } else {
    message = "Connected to Kite (read-only). Live quotes and historical data are available.";
  }

  return {
    provider: "zerodha-kite",
    liveDataEnabled,
    configured,
    authenticated,
    readOnly: true,
    mode: liveDataEnabled ? "live" : "disabled",
    message,
  };
}

/** Guard used by data endpoints: throws a clean, secret-free error when not ready. */
function assertReady(): void {
  if (!isLiveDataEnabled()) {
    throw new KiteError(
      "Live Kite data is disabled. Set KITE_ENABLE_LIVE_DATA=true in backend/.env to enable read-only live data.",
      503,
      "KITE_DISABLED",
    );
  }
  if (!isConfigured()) {
    throw new KiteError(
      "Kite is not configured. Set KITE_API_KEY and KITE_API_SECRET in backend/.env.",
      503,
      "KITE_NOT_CONFIGURED",
    );
  }
  if (!hasAccessToken()) {
    throw new KiteError("Login required. Authorise via the Kite login URL first.", 401, "KITE_LOGIN_REQUIRED");
  }
}

/** Build the Kite hosted login URL. Only the PUBLIC api_key is included. */
export function buildLoginUrl(): string {
  if (!isLiveDataEnabled()) {
    throw new KiteError(
      "Live Kite data is disabled. Set KITE_ENABLE_LIVE_DATA=true to use the login flow.",
      503,
      "KITE_DISABLED",
    );
  }
  if (!env.kite.apiKey) {
    throw new KiteError("KITE_API_KEY is not set in backend/.env.", 503, "KITE_NOT_CONFIGURED");
  }
  return `${env.kite.loginBase}?api_key=${encodeURIComponent(env.kite.apiKey)}&v=${KITE_API_VERSION}`;
}

/**
 * Exchange a request_token for an access_token (Kite "generate session").
 * checksum = SHA-256(api_key + request_token + api_secret).
 * The api_secret is used ONLY here to compute the checksum; it is never
 * returned or logged. The resulting access token is stored server-side only.
 */
export async function generateSession(requestToken: string): Promise<{ authenticated: true }> {
  if (!isLiveDataEnabled()) {
    throw new KiteError("Live Kite data is disabled.", 503, "KITE_DISABLED");
  }
  if (!isConfigured()) {
    throw new KiteError("Kite is not configured (KITE_API_KEY / KITE_API_SECRET).", 503, "KITE_NOT_CONFIGURED");
  }
  if (!requestToken) {
    throw new KiteError("Missing request_token from the Kite redirect.", 400, "KITE_BAD_REQUEST");
  }

  const checksum = createHash("sha256")
    .update(env.kite.apiKey + requestToken + env.kite.apiSecret)
    .digest("hex");

  const body = new URLSearchParams({
    api_key: env.kite.apiKey,
    request_token: requestToken,
    checksum,
  });

  const json = await kiteRequest<{ data?: { access_token?: string } }>(
    "POST",
    "/session/token",
    body,
    /* authed */ false,
  );

  const token = json?.data?.access_token;
  if (!token) {
    throw new KiteError("Kite did not return an access token.", 502, "KITE_NO_TOKEN");
  }
  accessToken = token; // server-side only
  return { authenticated: true };
}

/** Clear the server-side session (does not touch Kite). */
export function logout(): void {
  accessToken = null;
}

/** GET a live quote for one instrument, e.g. "NSE:RELIANCE". Read-only. */
export async function getQuote(instrument: string): Promise<unknown> {
  assertReady();
  if (!instrument || !instrument.includes(":")) {
    throw new KiteError('Invalid instrument. Use EXCHANGE:TRADINGSYMBOL, e.g. "NSE:RELIANCE".', 400, "KITE_BAD_INSTRUMENT");
  }
  const qs = new URLSearchParams({ i: instrument });
  const json = await kiteRequest<{ data?: Record<string, unknown> }>("GET", `/quote?${qs.toString()}`, undefined, true);
  return json?.data ?? {};
}

/** Shape of the fields we use from a Kite quote (other fields are ignored). */
export interface KiteQuoteData {
  instrumentToken: number | null;
  lastPrice: number;
  volume: number;
  ohlc: { open: number; high: number; low: number; close: number };
}

/**
 * GET a quote and return just the single instrument's object, normalised to the
 * fields the analysis layer needs. Read-only. The Kite `data` is keyed by the
 * instrument string (e.g. { "NSE:RELIANCE": { ... } }).
 */
export async function getQuoteData(instrument: string): Promise<KiteQuoteData> {
  const data = (await getQuote(instrument)) as Record<string, Record<string, unknown>>;
  const entry = data?.[instrument] ?? Object.values(data ?? {})[0];
  if (!entry || typeof entry !== "object") {
    throw new KiteError("Kite returned no quote for that instrument.", 404, "KITE_NO_QUOTE");
  }
  const ohlcRaw = (entry.ohlc as Record<string, unknown>) ?? {};
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    instrumentToken: typeof entry.instrument_token === "number" ? entry.instrument_token : null,
    lastPrice: num(entry.last_price),
    volume: num(entry.volume),
    ohlc: {
      open: num(ohlcRaw.open),
      high: num(ohlcRaw.high),
      low: num(ohlcRaw.low),
      close: num(ohlcRaw.close),
    },
  };
}

/**
 * GET quotes for MULTIPLE instruments in one call. Read-only.
 * Returns the raw Kite `data` object keyed by "EXCHANGE:TRADINGSYMBOL".
 * Invalid instruments are simply absent from the response (Kite ignores them),
 * so callers can detect per-instrument failures by missing keys.
 */
export async function getQuotes(instruments: string[]): Promise<Record<string, unknown>> {
  assertReady();
  const valid = instruments.map((s) => s.trim()).filter((s) => s.includes(":"));
  if (valid.length === 0) {
    throw new KiteError('Provide at least one instrument as EXCHANGE:TRADINGSYMBOL.', 400, "KITE_BAD_INSTRUMENT");
  }
  const qs = new URLSearchParams();
  for (const i of valid) qs.append("i", i);
  const json = await kiteRequest<{ data?: Record<string, unknown> }>("GET", `/quote?${qs.toString()}`, undefined, true);
  return json?.data ?? {};
}

// --------------------------- Account data (READ-ONLY GETs) ---------------------------
// These hit Kite's read-only account endpoints. They NEVER place/modify/cancel
// orders. If the connected app lacks permission, Kite returns a non-2xx which
// surfaces as a KiteError the caller can convert into a safe fallback.

/** GET /user/profile — basic profile (no funds). */
export async function getProfile(): Promise<Record<string, unknown>> {
  assertReady();
  const json = await kiteRequest<{ data?: Record<string, unknown> }>("GET", "/user/profile", undefined, true);
  return json?.data ?? {};
}

/** GET /user/margins — funds & margins across segments. */
export async function getMargins(): Promise<Record<string, unknown>> {
  assertReady();
  const json = await kiteRequest<{ data?: Record<string, unknown> }>("GET", "/user/margins", undefined, true);
  return json?.data ?? {};
}

/** GET /portfolio/holdings — long-term holdings. */
export async function getHoldings(): Promise<unknown[]> {
  assertReady();
  const json = await kiteRequest<{ data?: unknown[] }>("GET", "/portfolio/holdings", undefined, true);
  return Array.isArray(json?.data) ? json.data : [];
}

/** GET /portfolio/positions — intraday/F&O positions ({ net, day }). */
export async function getPositions(): Promise<Record<string, unknown>> {
  assertReady();
  const json = await kiteRequest<{ data?: Record<string, unknown> }>("GET", "/portfolio/positions", undefined, true);
  return json?.data ?? {};
}

/**
 * GET historical candles for an instrument_token. Read-only.
 * Kite path: /instruments/historical/:token/:interval?from=&to=
 */
export async function getHistorical(params: {
  instrumentToken: string;
  interval: string;
  from: string;
  to: string;
}): Promise<unknown> {
  assertReady();
  const { instrumentToken, interval, from, to } = params;
  if (!instrumentToken || !interval || !from || !to) {
    throw new KiteError(
      "Missing required params: instrumentToken, interval, from, to (from/to as YYYY-MM-DD HH:MM:SS).",
      400,
      "KITE_BAD_REQUEST",
    );
  }
  const qs = new URLSearchParams({ from, to });
  const path = `/instruments/historical/${encodeURIComponent(instrumentToken)}/${encodeURIComponent(
    interval,
  )}?${qs.toString()}`;
  const json = await kiteRequest<{ data?: unknown }>("GET", path, undefined, true);
  return json?.data ?? {};
}

/**
 * GET the Kite instruments master as raw CSV text. Read-only.
 * `segment` is an optional exchange filter ("NSE", "NFO", …) → /instruments/:exchange.
 *
 * NOTE: the instruments dump is a PUBLIC Kite endpoint — it does NOT require an
 * access token, only the api_key. So this needs live-data enabled + configured
 * (api_key/secret) but NOT a completed login. This lets instrument search work
 * before the user logs in (or after their daily token expires).
 */
export async function getInstrumentsCsv(segment?: string): Promise<string> {
  if (!isLiveDataEnabled()) {
    throw new KiteError(
      "Live Kite data is disabled. Set KITE_ENABLE_LIVE_DATA=true in backend/.env to enable instrument search.",
      503,
      "KITE_DISABLED",
    );
  }
  if (!env.kite.apiKey) {
    throw new KiteError(
      "Kite is not configured. Set KITE_API_KEY in backend/.env to enable instrument search.",
      503,
      "KITE_NOT_CONFIGURED",
    );
  }
  const path = segment ? `/instruments/${encodeURIComponent(segment)}` : "/instruments";
  return kiteText("GET", path);
}

/**
 * Low-level helper that returns the raw response TEXT (for CSV endpoints).
 * Sends the api_key; includes the access token only when one is present
 * (the instruments dump does not require it). Never logs secrets.
 */
async function kiteText(method: "GET" | "POST", path: string): Promise<string> {
  // Instruments dump auth: api_key is required; access_token is optional.
  const authToken = accessToken ?? "";
  let res: Response;
  try {
    res = await fetch(`${env.kite.apiBase}${path}`, {
      method,
      headers: {
        "X-Kite-Version": KITE_API_VERSION,
        Authorization: `token ${env.kite.apiKey}:${authToken}`,
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new KiteError(
      timedOut ? "Kite instruments request timed out." : "Could not reach the Kite API.",
      502,
      "KITE_UNREACHABLE",
    );
  }

  const text = await res.text();
  if (!res.ok) {
    // The instruments dump is public; a 403 here usually means a bad api_key,
    // not an expired session — surface a configuration-style error.
    throw new KiteError(
      `Kite instruments error (status ${res.status}). Check KITE_API_KEY.`,
      res.status === 403 ? 502 : res.status,
      "KITE_INSTRUMENTS_ERROR",
    );
  }
  return text;
}

/**
 * Low-level Kite HTTP helper. Adds the required headers, including the
 * `Authorization: token api_key:access_token` header for authed calls.
 * Never logs headers or secrets. Errors are normalised to KiteError with
 * Kite's message text only (which does not contain our secret).
 */
async function kiteRequest<T>(
  method: "GET" | "POST",
  path: string,
  body: URLSearchParams | undefined,
  authed: boolean,
): Promise<T> {
  const headers: Record<string, string> = {
    "X-Kite-Version": KITE_API_VERSION,
  };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (authed) {
    // Authorization carries the token but is never logged.
    headers["Authorization"] = `token ${env.kite.apiKey}:${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${env.kite.apiBase}${path}`, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new KiteError(
      timedOut ? "Kite API request timed out." : "Could not reach the Kite API.",
      502,
      "KITE_UNREACHABLE",
    );
  }

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new KiteError("Kite API returned a non-JSON response.", 502, "KITE_BAD_RESPONSE");
  }

  if (!res.ok) {
    // Kite error messages describe the API problem and do not include our secret.
    const message =
      (json as { message?: string })?.message ?? `Kite API error (status ${res.status}).`;
    // A 403 typically means the token expired / is invalid — surface as login required.
    if (res.status === 403) {
      accessToken = null;
      throw new KiteError("Kite session expired. Please log in again.", 401, "KITE_LOGIN_REQUIRED");
    }
    throw new KiteError(message, res.status, "KITE_API_ERROR");
  }

  return json as T;
}
