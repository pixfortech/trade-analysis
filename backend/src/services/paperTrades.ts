// =====================================================================
// Paper Trading — SIMULATED ONLY (Phase 3G, READ-ONLY for real trading)
// ---------------------------------------------------------------------
// A simulated trade book. Entries use LIVE Kite quotes for mark-to-market, but
// NOTHING here ever calls a Kite ORDER endpoint — there is no real buy/sell,
// modify, cancel, GTT or basket. Trades are stored in-memory and persisted to a
// gitignored local JSON file. All P/L values are simulated estimates.
//
// P/L formulas (per spec):
//   long  unrealised = (currentPrice - entryPrice) * qty
//   short unrealised = (entryPrice - currentPrice) * qty
//   long  realised   = (exitPrice   - entryPrice)  * qty
//   short realised   = (entryPrice  - exitPrice)   * qty
// =====================================================================

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { randomUUID } from "node:crypto";

export type Direction = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED" | "PARTIAL";

export interface PaperTrade {
  id: string;
  instrumentKey: string;
  displayName: string;
  direction: Direction;
  entryPrice: number;
  quantity: number; // remaining open quantity
  initialQuantity: number;
  lotSize: number;
  lots: number;
  stopLoss: number | null;
  targets: number[];
  status: TradeStatus;
  entryTime: string;
  exitPrice: number | null;
  exitTime: string | null;
  realisedPnl: number;
  notes: string;
  source: "paper-simulation";
}

/** A trade enriched with live mark-to-market fields for responses. */
export interface PaperTradeView extends PaperTrade {
  currentPrice: number | null;
  unrealisedPnl: number;
  pnlPercent: number;
}

const CACHE_FILE = resolvePath(process.cwd(), ".cache", "paper-trades.json");

let trades: PaperTrade[] = [];
let loaded = false;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function persist(): void {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ version: 1, trades }), "utf8");
  } catch {
    /* best-effort */
  }
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as { version: number; trades: PaperTrade[] };
    if (raw?.version === 1 && Array.isArray(raw.trades)) trades = raw.trades;
  } catch {
    trades = [];
  }
}

// --------------------------- pure P/L (exported for tests) ---------------------------

export function unrealised(direction: Direction, entryPrice: number, currentPrice: number, qty: number): number {
  return round2((direction === "LONG" ? currentPrice - entryPrice : entryPrice - currentPrice) * qty);
}
export function realised(direction: Direction, entryPrice: number, exitPrice: number, qty: number): number {
  return round2((direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice) * qty);
}

// --------------------------- store ops ---------------------------

export interface OpenInput {
  instrumentKey: string;
  displayName?: string;
  direction: Direction;
  entryPrice: number;
  quantity?: number;
  lotSize?: number;
  lots?: number;
  stopLoss?: number | null;
  targets?: number[];
  notes?: string;
}

export function openTrade(input: OpenInput): PaperTrade {
  ensureLoaded();
  const lotSize = input.lotSize && input.lotSize > 0 ? input.lotSize : 1;
  const lots = input.lots && input.lots > 0 ? input.lots : undefined;
  const quantity = input.quantity && input.quantity > 0 ? input.quantity : lots ? lots * lotSize : lotSize;
  const trade: PaperTrade = {
    id: randomUUID(),
    instrumentKey: input.instrumentKey,
    displayName: input.displayName ?? input.instrumentKey,
    direction: input.direction,
    entryPrice: round2(input.entryPrice),
    quantity,
    initialQuantity: quantity,
    lotSize,
    lots: lots ?? Math.max(1, Math.round(quantity / lotSize)),
    stopLoss: input.stopLoss ?? null,
    targets: (input.targets ?? []).slice(0, 3),
    status: "OPEN",
    entryTime: new Date().toISOString(),
    exitPrice: null,
    exitTime: null,
    realisedPnl: 0,
    notes: input.notes ?? "",
    source: "paper-simulation",
  };
  trades.unshift(trade);
  persist();
  return trade;
}

export function closeTrade(id: string, exitPrice: number): PaperTrade | null {
  ensureLoaded();
  const t = trades.find((x) => x.id === id);
  if (!t || t.status === "CLOSED") return t ?? null;
  t.realisedPnl = round2(t.realisedPnl + realised(t.direction, t.entryPrice, exitPrice, t.quantity));
  t.quantity = 0;
  t.exitPrice = round2(exitPrice);
  t.exitTime = new Date().toISOString();
  t.status = "CLOSED";
  persist();
  return t;
}

export function partialClose(id: string, exitPrice: number, qty: number): PaperTrade | null {
  ensureLoaded();
  const t = trades.find((x) => x.id === id);
  if (!t || t.status === "CLOSED") return t ?? null;
  const closeQty = Math.min(Math.max(1, Math.floor(qty)), t.quantity);
  t.realisedPnl = round2(t.realisedPnl + realised(t.direction, t.entryPrice, exitPrice, closeQty));
  t.quantity -= closeQty;
  if (t.quantity <= 0) {
    t.quantity = 0;
    t.exitPrice = round2(exitPrice);
    t.exitTime = new Date().toISOString();
    t.status = "CLOSED";
  } else {
    t.status = "PARTIAL";
  }
  persist();
  return t;
}

export function listTrades(): PaperTrade[] {
  ensureLoaded();
  return trades;
}

export function reset(): void {
  ensureLoaded();
  trades = [];
  persist();
}

/** Attach live MTM to a trade. `priceByInstrument` maps key → current price. */
export function toView(t: PaperTrade, priceByInstrument: Map<string, number>): PaperTradeView {
  const current = priceByInstrument.get(t.instrumentKey) ?? null;
  const unreal = current != null && t.quantity > 0 ? unrealised(t.direction, t.entryPrice, current, t.quantity) : 0;
  const base = t.entryPrice * (t.initialQuantity || 1);
  const pnlPercent = base > 0 ? round2(((unreal + t.realisedPnl) / base) * 100) : 0;
  return { ...t, currentPrice: current, unrealisedPnl: unreal, pnlPercent };
}

export function summary(views: PaperTradeView[]) {
  const open = views.filter((v) => v.status !== "CLOSED");
  const totalUnrealised = round2(views.reduce((a, v) => a + v.unrealisedPnl, 0));
  const totalRealised = round2(views.reduce((a, v) => a + v.realisedPnl, 0));
  return {
    count: views.length,
    openCount: open.length,
    totalUnrealisedPnl: totalUnrealised,
    totalRealisedPnl: totalRealised,
    totalPnl: round2(totalUnrealised + totalRealised),
  };
}

/** Distinct instrument keys for OPEN/PARTIAL trades (for batch quoting). */
export function openInstrumentKeys(): string[] {
  ensureLoaded();
  return Array.from(new Set(trades.filter((t) => t.status !== "CLOSED").map((t) => t.instrumentKey)));
}
