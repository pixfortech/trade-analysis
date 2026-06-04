// Shared input resolver (Phase 3C). Lets /quote and /live-trade-plan accept
// EITHER an exact `instrument=EXCHANGE:TRADINGSYMBOL` OR resolved F&O params
// (underlying/segment/instrumentType/expiry/strike/optionType). READ-ONLY.

import * as instruments from "./instruments.service";
import { KiteError } from "./kite.service";
import { isSupportedExchange } from "./instrumentSearch";

/** Best-effort underlying for suggesting a tradable future for a reference symbol. */
function refUnderlying(name: string): string {
  const n = (name || "").toUpperCase();
  if (n.includes("BANK")) return "BANKNIFTY";
  if (n.includes("SENSEX")) return "SENSEX";
  if (n.includes("FIN")) return "FINNIFTY";
  return "NIFTY"; // GIFT NIFTY, SGX NIFTY, NIFTY, etc.
}

export interface ResolvedInstrument {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  instrumentToken: number | null;
  lotSize: number | null;
  name: string | null;
  expiry: string | null;
  strike: number | null;
  instrumentType: string | null;
  resolvedFrom: "exact" | "resolver";
}

export interface ResolveQuery {
  instrument?: string;
  underlying?: string;
  segment?: string;
  instrumentType?: string;
  expiry?: string;
  strike?: string | number;
  optionType?: string;
}

/**
 * Turn a request's query into an exact instrument string (+ token/lot when
 * known). If `instrument` is given, it is used as-is (and enriched from the
 * cache when available). Otherwise the F&O resolver runs; ambiguous/no matches
 * raise a KiteError carrying guidance (candidates serialised in the message is
 * avoided — callers can call the resolver endpoint for the full list).
 */
export async function resolveInstrumentInput(q: ResolveQuery): Promise<ResolvedInstrument> {
  const exact = (q.instrument ?? "").trim();

  if (exact) {
    const parts = exact.split(":");
    const exchange = (parts[0] ?? "").trim().toUpperCase();
    const tradingsymbol = parts.slice(1).join(":").trim();
    // Best-effort enrichment from the cache (does not force a download). Real
    // instruments are trusted even if the symbol contains spaces — index names
    // legitimately do, e.g. "NSE:NIFTY 50", "BSE:SENSEX".
    const hit = instruments.isLoaded() ? instruments.lookupByKey(exact) : undefined;

    // 1) Must be EXCHANGE:TRADINGSYMBOL.
    if (parts.length !== 2 || !exchange || !tradingsymbol) {
      throw new KiteError(
        `"${exact}" is not a valid Kite instrument. Use EXCHANGE:TRADINGSYMBOL ` +
          '(e.g. "NSE:RELIANCE" or "NFO:MIDCPNIFTY26JUNFUT"). For futures/options, pass resolver ' +
          "params: underlying, instrumentType (FUT/CE/PE), expiry and (for options) strike — " +
          "or call /api/kite/instruments/resolve.",
        400,
        "KITE_BAD_INSTRUMENT",
      );
    }

    // 2) Reference-only exchanges (e.g. NSEIX / BSEIX — GIFT NIFTY) exist in the
    // dump but Kite can't quote them. Return a CONTROLLED status instead of
    // letting Kite throw a raw "not a valid instrument" error.
    if (!isSupportedExchange(exchange)) {
      throw new KiteError(
        `${exact} is a reference-only instrument (exchange ${exchange}) and is not directly quoteable via Kite. ` +
          `Choose a tradable instrument — e.g. the nearest ${refUnderlying(hit?.name || tradingsymbol)} future — for live analysis.`,
        422,
        "KITE_REFERENCE_ONLY",
      );
    }

    // 3) On a quoteable exchange but NOT a real cached symbol and clearly
    // free-text (has spaces) → guide to the F&O resolver, don't send a bad key.
    if (!hit && /\s/.test(tradingsymbol)) {
      throw new KiteError(
        `"${exact}" is not a valid Kite instrument. Use EXCHANGE:TRADINGSYMBOL with no spaces ` +
          '(e.g. "NSE:RELIANCE" or "NFO:MIDCPNIFTY26JUNFUT"). For futures/options, pass resolver ' +
          "params: underlying, instrumentType (FUT/CE/PE), expiry and (for options) strike — " +
          "or call /api/kite/instruments/resolve. If you expected this symbol, refresh the instruments cache.",
        400,
        "KITE_BAD_INSTRUMENT",
      );
    }

    return {
      instrument: exact,
      instrumentToken: hit?.instrumentToken ?? null,
      lotSize: hit?.lotSize ?? null,
      name: hit?.name ?? null,
      expiry: hit?.expiry ?? null,
      strike: hit?.strike ?? null,
      instrumentType: hit?.instrumentType ?? null,
      resolvedFrom: "exact",
    };
  }

  if (!q.underlying) {
    throw new KiteError(
      "Provide either `instrument=EXCHANGE:TRADINGSYMBOL` or resolver params (underlying, instrumentType, expiry/strike).",
      400,
      "KITE_RESOLVE_REQUIRED",
    );
  }

  const strikeNum = q.strike != null && q.strike !== "" ? Number(q.strike) : undefined;
  const result = await instruments.resolve({
    underlying: String(q.underlying),
    segment: q.segment ? String(q.segment) : undefined,
    instrumentType: String(q.instrumentType ?? q.optionType ?? ""),
    expiry: q.expiry ? String(q.expiry) : undefined,
    strike: strikeNum,
    optionType: q.optionType ? String(q.optionType) : undefined,
  });

  if (!result.resolved) {
    const err = new KiteError(result.message, 404, "KITE_RESOLVE_AMBIGUOUS");
    // Attach candidates for the caller to surface (typed-any to avoid leaking secrets elsewhere).
    (err as KiteError & { candidates?: unknown }).candidates = result.candidates.map(toCandidate);
    throw err;
  }

  const ins = result.resolved;
  return {
    instrument: `${ins.exchange}:${ins.tradingsymbol}`,
    instrumentToken: ins.instrumentToken,
    lotSize: ins.lotSize,
    name: ins.name,
    expiry: ins.expiry,
    strike: ins.strike,
    instrumentType: ins.instrumentType,
    resolvedFrom: "resolver",
  };
}

export function toCandidate(i: instruments.Instrument) {
  return {
    instrument: `${i.exchange}:${i.tradingsymbol}`,
    tradingsymbol: i.tradingsymbol,
    name: i.name,
    exchange: i.exchange,
    instrumentType: i.instrumentType,
    expiry: i.expiry,
    strike: i.strike,
    lotSize: i.lotSize,
    instrumentToken: i.instrumentToken,
  };
}
