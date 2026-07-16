// =====================================================================
// LIVE options chain — READ-ONLY. Built from the Kite instrument catalogue
// (selected underlying + expiry) and BATCHED live quotes. Computes ATM / PCR /
// max-pain / support / resistance from the actual loaded OI (never sample data;
// missing inputs → null, never fabricated). Rate-limit-safe batching + per
// (underlying|expiry) cache. Read-only — no order/execution logic.
// =====================================================================

import * as kite from "./kite.service";
import * as instruments from "./instruments.service";
import type { Instrument } from "./instruments.service";
import { extractQuote } from "./contractIdentity";
import { round2 } from "./technicalAnalysis";
import { intelConfig } from "../config/intelligence.config";

const TZ = intelConfig.session.timezone;

export interface OptionSide {
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  oi: number | null;
  bid: number | null;
  ask: number | null;
  instrument: string | null;
  token: number | null;
}
export interface OptionRow { strike: number; isATM: boolean; ce: OptionSide; pe: OptionSide }
export interface ChainMetrics {
  atm: number | null;
  pcr: number | null;
  maxPain: number | null;
  support: number | null;
  resistance: number | null;
  completeness: number; // 0–1: strikes with both CE & PE OI present
  totalCeOi: number;
  totalPeOi: number;
}
export interface OptionsChainResult {
  underlying: string;
  expiry: string | null;
  expiries: string[];
  spot: { value: number | null; ms: number | null; source: "exchange" | "receipt" | "none" };
  rows: OptionRow[];
  metrics: ChainMetrics;
  timestamp: string;
  scanned: number;
  total: number;
  message: string;
  readOnly: true;
}

const EMPTY_SIDE: OptionSide = { ltp: null, change: null, changePercent: null, volume: null, oi: null, bid: null, ask: null, instrument: null, token: null };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function nearestIndex(sorted: number[], target: number): number {
  let best = 0;
  for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i] - target) < Math.abs(sorted[best] - target)) best = i;
  return best;
}
const notExpired = (expiry: string) => !!expiry && Date.parse(expiry) >= Date.now() - 86_400_000;

/** PCR / max-pain / support / resistance / ATM from the loaded chain. Pure. */
export function computeChainMetrics(rows: OptionRow[], spot: number | null): ChainMetrics {
  const ceOi = (r: OptionRow) => r.ce.oi ?? 0;
  const peOi = (r: OptionRow) => r.pe.oi ?? 0;
  const totalCeOi = rows.reduce((a, r) => a + ceOi(r), 0);
  const totalPeOi = rows.reduce((a, r) => a + peOi(r), 0);
  const withBoth = rows.filter((r) => r.ce.oi != null && r.pe.oi != null).length;
  const completeness = rows.length ? round2(withBoth / rows.length) : 0;

  let atm: number | null = null;
  if (spot != null && rows.length) {
    const strikes = rows.map((r) => r.strike);
    atm = strikes[nearestIndex(strikes, spot)];
  }
  // No OI at all → we cannot honestly derive PCR/max-pain/S-R.
  if (totalCeOi === 0 && totalPeOi === 0) {
    return { atm, pcr: null, maxPain: null, support: null, resistance: null, completeness, totalCeOi, totalPeOi };
  }
  const pcr = totalCeOi > 0 ? round2(totalPeOi / totalCeOi) : null;
  let support: number | null = null;
  let resistance: number | null = null;
  let maxPeOi = -1;
  let maxCeOi = -1;
  for (const r of rows) {
    if (peOi(r) > maxPeOi) { maxPeOi = peOi(r); support = r.strike; }
    if (ceOi(r) > maxCeOi) { maxCeOi = ceOi(r); resistance = r.strike; }
  }
  // Max pain = the strike that minimises total option-buyer payout at expiry.
  let maxPain: number | null = null;
  let minPain = Infinity;
  for (const cand of rows) {
    let pain = 0;
    for (const r of rows) pain += ceOi(r) * Math.max(0, cand.strike - r.strike) + peOi(r) * Math.max(0, r.strike - cand.strike);
    if (pain < minPain) { minPain = pain; maxPain = cand.strike; }
  }
  return { atm, pcr, maxPain, support, resistance, completeness, totalCeOi, totalPeOi };
}

/** Distinct non-expired option expiries for an underlying, ascending. */
export async function getOptionExpiries(underlying: string): Promise<string[]> {
  await instruments.ensureLoaded().catch(() => {});
  const U = underlying.toUpperCase();
  const set = new Set<string>();
  for (const i of instruments.allInstruments()) {
    if (["CE", "PE"].includes(i.instrumentType.toUpperCase()) && (i.name || "").toUpperCase() === U && i.exchange.toUpperCase() === "NFO" && notExpired(i.expiry)) set.add(i.expiry);
  }
  return [...set].sort();
}

const cache = new Map<string, { at: number; result: OptionsChainResult }>();

export async function getOptionsChain(opts: { underlying: string; expiry?: string; strikes?: number }): Promise<OptionsChainResult> {
  await instruments.ensureLoaded().catch(() => {});
  const U = opts.underlying.toUpperCase();
  const all = instruments.allInstruments();
  const expiries = [...new Set(all.filter((i) => ["CE", "PE"].includes(i.instrumentType.toUpperCase()) && (i.name || "").toUpperCase() === U && i.exchange.toUpperCase() === "NFO" && notExpired(i.expiry)).map((i) => i.expiry))].sort();
  const expiry = opts.expiry && expiries.includes(opts.expiry) ? opts.expiry : expiries[0] ?? null;
  const strikesCount = clamp(opts.strikes ?? intelConfig.optionsChain.defaultStrikes, 2, 60);
  const now = Date.now();
  const timestamp = new Date(now).toISOString();

  if (!expiry) {
    return { underlying: U, expiry: null, expiries, spot: { value: null, ms: null, source: "none" }, rows: [], metrics: { atm: null, pcr: null, maxPain: null, support: null, resistance: null, completeness: 0, totalCeOi: 0, totalPeOi: 0 }, timestamp, scanned: 0, total: 0, message: `No live option expiries for ${U} in the Kite catalogue.`, readOnly: true };
  }

  const cacheKey = `${U}|${expiry}|${strikesCount}`;
  const c = cache.get(cacheKey);
  if (c && now - c.at < intelConfig.optionsChain.cacheMs) return c.result;

  // Group contracts by strike (CE/PE) for the underlying + expiry.
  const byStrike = new Map<number, { ce?: Instrument; pe?: Instrument }>();
  for (const i of all) {
    if (i.exchange.toUpperCase() !== "NFO" || i.expiry !== expiry || (i.name || "").toUpperCase() !== U) continue;
    const t = i.instrumentType.toUpperCase();
    if (t !== "CE" && t !== "PE") continue;
    const g = byStrike.get(i.strike) ?? {};
    if (t === "CE") g.ce = i; else g.pe = i;
    byStrike.set(i.strike, g);
  }
  const allStrikes = [...byStrike.keys()].sort((a, b) => a - b);

  // Live underlying spot → ATM.
  const spotKey = intelConfig.optionsChain.spotSymbols[U] ?? `NSE:${U}`;
  let spotVal: number | null = null;
  let spotMs: number | null = null;
  let spotSource: "exchange" | "receipt" | "none" = "none";
  try {
    const sq = await kite.getQuotes([spotKey]);
    const e = sq[spotKey] as Record<string, unknown> | undefined;
    if (e) { const qf = extractQuote(e, TZ); spotVal = qf.ltp > 0 ? qf.ltp : null; spotMs = qf.exchangeTimeMs; spotSource = qf.exchangeTimeMs != null ? "exchange" : "receipt"; }
  } catch { /* spot unavailable → ATM by mid-strike below */ }

  // Pick strikes around ATM (or the middle), bounded by maxContracts.
  const centre = spotVal != null && allStrikes.length ? nearestIndex(allStrikes, spotVal) : Math.floor(allStrikes.length / 2);
  const maxStrikes = Math.floor(intelConfig.optionsChain.maxContracts / 2);
  const half = Math.min(strikesCount, maxStrikes);
  const picked = allStrikes.slice(Math.max(0, centre - half), centre + half + 1);

  const keys: string[] = [];
  for (const s of picked) {
    const g = byStrike.get(s)!;
    if (g.ce) keys.push(`${g.ce.exchange}:${g.ce.tradingsymbol}`);
    if (g.pe) keys.push(`${g.pe.exchange}:${g.pe.tradingsymbol}`);
  }

  const data: Record<string, unknown> = {};
  const batch = intelConfig.optionsChain.quoteBatchSize;
  for (let i = 0; i < keys.length; i += batch) Object.assign(data, await kite.getQuotes(keys.slice(i, i + batch)));

  let scanned = 0;
  const side = (inst?: Instrument): OptionSide => {
    if (!inst) return EMPTY_SIDE;
    const key = `${inst.exchange}:${inst.tradingsymbol}`;
    const raw = data[key] as Record<string, unknown> | undefined;
    if (!raw) return { ...EMPTY_SIDE, instrument: key, token: inst.instrumentToken };
    const qf = extractQuote(raw, TZ);
    if (qf.ltp > 0) scanned++;
    return { ltp: qf.ltp > 0 ? qf.ltp : null, change: qf.prevClose > 0 ? qf.change : null, changePercent: qf.prevClose > 0 ? qf.changePercent : null, volume: qf.volume, oi: qf.oi, bid: qf.bid, ask: qf.ask, instrument: key, token: inst.instrumentToken };
  };

  const rows: OptionRow[] = picked.map((s) => { const g = byStrike.get(s)!; return { strike: s, isATM: false, ce: side(g.ce), pe: side(g.pe) }; });
  const metrics = computeChainMetrics(rows, spotVal);
  if (metrics.atm != null) { const r = rows.find((x) => x.strike === metrics.atm); if (r) r.isATM = true; }

  const result: OptionsChainResult = {
    underlying: U, expiry, expiries, spot: { value: spotVal, ms: spotMs, source: spotSource }, rows, metrics, timestamp,
    scanned, total: keys.length,
    message: `Live chain · ${U} ${expiry} · ${rows.length} strikes · ${scanned}/${keys.length} contracts quoted.`,
    readOnly: true,
  };
  cache.set(cacheKey, { at: now, result });
  return result;
}
