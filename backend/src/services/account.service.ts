// =====================================================================
// Zerodha Account service — READ-ONLY (Phase 3G)
// ---------------------------------------------------------------------
// Normalises Kite's read-only account endpoints (profile/margins/holdings/
// positions) into safe, secret-free shapes for the dashboard. Every value is
// labelled with a `source` (zerodha | unavailable). If an endpoint is not
// permitted for the connected app, a structured fallback is returned instead
// of fake data. NEVER places/modifies/cancels orders.
// =====================================================================

import * as kite from "./kite.service";
import { KiteError } from "./kite.service";

export interface AccountSummary {
  source: "zerodha" | "unavailable";
  availableCapital: number;
  availableCash: number;
  marginAvailable: number;
  marginUsed: number;
  holdingsValue: number;
  positionsPnl: number;
  message: string;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Wrap a read-only account call so permission errors become safe fallbacks. */
async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string; code: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof KiteError) return { ok: false, message: err.message, code: err.code };
    return { ok: false, message: "Account data unavailable.", code: "ACCOUNT_ERROR" };
  }
}

export async function getProfile() {
  return safe(() => kite.getProfile());
}
export async function getFundsAndMargins() {
  return safe(() => kite.getMargins());
}
export async function getHoldings() {
  return safe(() => kite.getHoldings());
}
export async function getPositions() {
  return safe(() => kite.getPositions());
}

/** Sum the equity-segment available cash from a Kite margins payload. */
function extractCash(margins: Record<string, unknown>): { cash: number; used: number; net: number } {
  const eq = (margins?.equity as Record<string, unknown>) ?? {};
  const available = (eq.available as Record<string, unknown>) ?? {};
  const cash = num(available.cash) || num(available.live_balance) || num(eq.net);
  const used = num((eq.utilised as Record<string, unknown>)?.debits);
  const net = num(eq.net) || cash;
  return { cash, used, net };
}

/** Value of holdings = Σ last_price × quantity (best-effort). */
function holdingsValue(holdings: unknown[]): number {
  let total = 0;
  for (const h of holdings) {
    const row = h as Record<string, unknown>;
    total += num(row.last_price) * (num(row.quantity) + num(row.t1_quantity));
  }
  return Math.round(total * 100) / 100;
}

/** Net P/L across positions ("net" bucket). */
function positionsPnl(positions: Record<string, unknown>): number {
  const net = (positions?.net as unknown[]) ?? [];
  let pnl = 0;
  for (const p of net) pnl += num((p as Record<string, unknown>).pnl);
  return Math.round(pnl * 100) / 100;
}

/**
 * Portfolio summary combining margins + holdings + positions. Read-only.
 * Returns `source: "unavailable"` (not fake data) when funds can't be read.
 */
export async function getPortfolioSummary(): Promise<AccountSummary> {
  const marginsRes = await getFundsAndMargins();
  if (!marginsRes.ok) {
    return {
      source: "unavailable",
      availableCapital: 0,
      availableCash: 0,
      marginAvailable: 0,
      marginUsed: 0,
      holdingsValue: 0,
      positionsPnl: 0,
      message: `Account funds unavailable: ${marginsRes.message} Enter capital manually in Risk Management.`,
    };
  }
  const { cash, used, net } = extractCash(marginsRes.data);

  const holdingsRes = await getHoldings();
  const positionsRes = await getPositions();
  const hv = holdingsRes.ok ? holdingsValue(holdingsRes.data) : 0;
  const pnl = positionsRes.ok ? positionsPnl(positionsRes.data) : 0;

  return {
    source: "zerodha",
    availableCapital: Math.round((net + hv) * 100) / 100,
    availableCash: Math.round(cash * 100) / 100,
    marginAvailable: Math.round(net * 100) / 100,
    marginUsed: Math.round(used * 100) / 100,
    holdingsValue: hv,
    positionsPnl: pnl,
    message: "Live read-only account data from Zerodha.",
  };
}
