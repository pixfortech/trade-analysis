// =====================================================================
// Canonical contract identity + display labels + quote-field extraction (pure).
// Fixes option labels that collapsed to just the underlying ("NIFTY") — every
// option/future keeps its expiry, strike and CE/PE. Also pulls LTP / change /
// volume / OI / bid / ask / spread / exchange-time out of a raw Kite quote so
// movers and the option chain can filter on real liquidity.
// =====================================================================

import { round2 } from "./technicalAnalysis";
import { wallClockToMs } from "./sessionOhlc";
import type { Instrument } from "./instruments.service";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-24" → { long: "24 Jul 2026", short: "24 Jul" }. */
export function fmtExpiry(expiry: string): { long: string; short: string } | null {
  const m = expiry.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const mo = MONTHS[Number(m[2]) - 1] ?? m[2];
  const d = String(Number(m[3]));
  return { long: `${d} ${mo} ${m[1]}`, short: `${d} ${mo}` };
}

function fmtStrike(strike: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(strike);
}

export interface ContractIdentity {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  instrumentToken: number;
  exchange: string;
  tradingsymbol: string;
  displayName: string; // full: "NIFTY 24 Jul 2026 · 25,000 CE"
  compactName: string; // compact: "NIFTY 25,000 CE · 24 Jul"
  underlying: string;
  instrumentType: string; // EQ | FUT | CE | PE
  segment: string;
  expiry: string; // YYYY-MM-DD ("" for cash)
  strike: number;
  optionType: "CE" | "PE" | "";
  lotSize: number;
  tickSize: number;
}

export function contractIdentity(i: Instrument): ContractIdentity {
  const type = (i.instrumentType || "").toUpperCase();
  const underlying = (i.name || i.tradingsymbol).toUpperCase();
  const exp = i.expiry ? fmtExpiry(i.expiry) : null;
  const optionType: "CE" | "PE" | "" = type === "CE" || type === "PE" ? type : "";

  let displayName: string;
  let compactName: string;
  if (optionType) {
    displayName = `${underlying}${exp ? ` ${exp.long}` : ""} · ${fmtStrike(i.strike)} ${optionType}`;
    compactName = `${underlying} ${fmtStrike(i.strike)} ${optionType}${exp ? ` · ${exp.short}` : ""}`;
  } else if (type === "FUT") {
    displayName = `${underlying}${exp ? ` ${exp.long}` : ""} FUT`;
    compactName = `${underlying} FUT${exp ? ` · ${exp.short}` : ""}`;
  } else {
    displayName = i.name || i.tradingsymbol;
    compactName = i.tradingsymbol;
  }

  return {
    instrument: `${i.exchange}:${i.tradingsymbol}`,
    instrumentToken: i.instrumentToken,
    exchange: i.exchange,
    tradingsymbol: i.tradingsymbol,
    displayName,
    compactName,
    underlying,
    instrumentType: type,
    segment: i.segment,
    expiry: i.expiry,
    strike: i.strike,
    optionType,
    lotSize: i.lotSize,
    tickSize: i.tickSize,
  };
}

export interface QuoteFields {
  ltp: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: number;
  oi: number | null;
  bid: number | null;
  ask: number | null;
  spreadPct: number | null; // (ask-bid)/ltp × 100
  exchangeTimeMs: number | null;
}

/** Pull the liquidity/price fields we need from a raw Kite /quote entry. */
export function extractQuote(q: Record<string, unknown>, timezone: string): QuoteFields {
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const ltp = n(q.last_price);
  const ohlc = (q.ohlc as Record<string, unknown>) ?? {};
  const prevClose = n(ohlc.close);
  const change = prevClose > 0 ? round2(ltp - prevClose) : 0;
  const changePercent = prevClose > 0 ? round2(((ltp - prevClose) / prevClose) * 100) : 0;
  const oiRaw = q.oi;
  const oi = typeof oiRaw === "number" && oiRaw > 0 ? oiRaw : null;
  const depth = q.depth as { buy?: { price?: number }[]; sell?: { price?: number }[] } | undefined;
  const bidRaw = depth?.buy?.[0]?.price;
  const askRaw = depth?.sell?.[0]?.price;
  const bid = typeof bidRaw === "number" && bidRaw > 0 ? bidRaw : null;
  const ask = typeof askRaw === "number" && askRaw > 0 ? askRaw : null;
  const spreadPct = bid != null && ask != null && ltp > 0 ? round2(((ask - bid) / ltp) * 100) : null;
  const ltt = typeof q.last_trade_time === "string" ? q.last_trade_time : typeof q.timestamp === "string" ? q.timestamp : null;
  const exchangeTimeMs = ltt ? wallClockToMs(ltt, timezone) : null;
  return { ltp, prevClose, change, changePercent, volume: n(q.volume), oi, bid, ask, spreadPct, exchangeTimeMs };
}
