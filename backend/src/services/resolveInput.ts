// Shared input resolver (Phase 3C). Lets /quote and /live-trade-plan accept
// EITHER an exact `instrument=EXCHANGE:TRADINGSYMBOL` OR resolved F&O params
// (underlying/segment/instrumentType/expiry/strike/optionType). READ-ONLY.

import * as instruments from "./instruments.service";
import { KiteError } from "./kite.service";

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
    const tradingsymbol = parts.slice(1).join(":");
    // A valid Kite key is EXCHANGE:TRADINGSYMBOL with no spaces in the symbol.
    // Inputs like "NSE:MIDCPNIFTY FUT JUN" are NOT valid Kite symbols — guide
    // the user to the F&O resolver instead of sending a bad key to Kite.
    if (parts.length !== 2 || !parts[0] || !tradingsymbol || /\s/.test(tradingsymbol)) {
      throw new KiteError(
        `"${exact}" is not a valid Kite instrument. Use EXCHANGE:TRADINGSYMBOL with no spaces ` +
          '(e.g. "NSE:RELIANCE" or "NFO:MIDCPNIFTY26JUNFUT"). For futures/options, pass resolver ' +
          "params instead: underlying, instrumentType (FUT/CE/PE), expiry and (for options) strike — " +
          "or call /api/kite/instruments/resolve.",
        400,
        "KITE_BAD_INSTRUMENT",
      );
    }
    // Best-effort enrichment from the cache (does not force a download).
    const hit = instruments.isLoaded() ? instruments.lookupByKey(exact) : undefined;
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
