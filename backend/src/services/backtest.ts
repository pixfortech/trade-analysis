// =====================================================================
// Backtest / validation framework (§21–23) — PURE & deterministic.
// Separates SIGNAL GENERATION from TRADE SIMULATION so each strategy can be
// validated independently, then computes honest metrics (win rate, expectancy
// in R, profit factor, avg R, max drawdown in R, sample size).
//
// IMPORTANT: this is the framework + math. Producing real, out-of-sample,
// multi-instrument results requires replaying live Kite HISTORICAL candles
// (needs Kite auth) — it is intentionally NOT run at build time and never
// fabricates results. Feed it real candles from getHistorical to validate.
// =====================================================================

import { round2, type Candle } from "./technicalAnalysis";
import { connorsRSI, atrSeries } from "./strategyIndicators";
import type { ConnorsRSIParams } from "./strategyIndicators";

export interface EntrySignal {
  idx: number; // candle index the signal is generated on (enter at idx+1 open)
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
}

export interface SimTrade {
  entryIdx: number;
  exitIdx: number;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  rMultiple: number;
  win: boolean;
  barsHeld: number;
  mfeR: number; // max favourable excursion, in R
  maeR: number; // max adverse excursion, in R
}

export interface BacktestMetrics {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number; // %
  expectancyR: number; // average R per trade
  profitFactor: number; // gross win R / gross loss R
  avgR: number;
  maxDrawdownR: number;
  avgBarsHeld: number;
  sample: number;
  sufficientSample: boolean;
  note: string;
}

/**
 * Simulate each entry to its stop or target over the following candles. A long
 * is a loss if low ≤ stop first, a win if high ≥ target first (stop checked
 * first on the same bar — conservative). Unresolved trades within `horizon`
 * exit at the last close for a partial R. Returns realised trades.
 */
export function simulateTrades(candles: Candle[], signals: EntrySignal[], horizon = 60): SimTrade[] {
  const out: SimTrade[] = [];
  for (const s of signals) {
    const risk = Math.abs(s.entry - s.stop);
    if (risk <= 0) continue;
    const long = s.direction === "LONG";
    let exit = s.entry;
    let exitIdx = s.idx + 1;
    let mfe = 0;
    let mae = 0;
    let resolved = false;
    for (let i = s.idx + 1; i < candles.length && i <= s.idx + horizon; i++) {
      const c = candles[i];
      const fav = long ? c.h - s.entry : s.entry - c.l;
      const adv = long ? s.entry - c.l : c.h - s.entry;
      if (fav / risk > mfe) mfe = fav / risk;
      if (adv / risk > mae) mae = adv / risk;
      const hitStop = long ? c.l <= s.stop : c.h >= s.stop;
      const hitTarget = long ? c.h >= s.target : c.l <= s.target;
      if (hitStop) { exit = s.stop; exitIdx = i; resolved = true; break; } // conservative: stop first
      if (hitTarget) { exit = s.target; exitIdx = i; resolved = true; break; }
    }
    if (!resolved) {
      const last = Math.min(candles.length - 1, s.idx + horizon);
      exit = candles[last].c;
      exitIdx = last;
    }
    const r = (long ? exit - s.entry : s.entry - exit) / risk;
    out.push({ entryIdx: s.idx, exitIdx, direction: s.direction, entry: round2(s.entry), exit: round2(exit), rMultiple: round2(r), win: r > 0, barsHeld: exitIdx - s.idx, mfeR: round2(mfe), maeR: round2(mae) });
  }
  return out;
}

export function computeMetrics(trades: SimTrade[], label: string, minSample: number): BacktestMetrics {
  const n = trades.length;
  const wins = trades.filter((t) => t.win);
  const losses = trades.filter((t) => !t.win);
  const grossWin = wins.reduce((a, t) => a + t.rMultiple, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.rMultiple, 0));
  const totalR = trades.reduce((a, t) => a + t.rMultiple, 0);

  // Max drawdown of the cumulative-R equity curve.
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const t of trades) {
    equity += t.rMultiple;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDd) maxDd = peak - equity;
  }

  return {
    label,
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n ? round2((wins.length / n) * 100) : 0,
    expectancyR: n ? round2(totalR / n) : 0,
    profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : grossWin > 0 ? Infinity : 0,
    avgR: n ? round2(totalR / n) : 0,
    maxDrawdownR: round2(maxDd),
    avgBarsHeld: n ? round2(trades.reduce((a, t) => a + t.barsHeld, 0) / n) : 0,
    sample: n,
    sufficientSample: n >= minSample,
    note: n >= minSample ? "" : `Sample ${n} < min ${minSample} — do NOT tune production weights on this.`,
  };
}

/** Connors RSI + EMA-trend-filter signal generator (§22A). Pure. */
export function connorsSignals(
  candles: Candle[],
  cfg: ConnorsRSIParams & { oversold: number; overbought: number; trendEmaPeriod: number },
  slMult: number,
  rr: number,
): EntrySignal[] {
  const closes = candles.map((c) => c.c);
  const atrs = atrSeries(candles, 14);
  const signals: EntrySignal[] = [];
  const need = Math.max(cfg.rankPeriod, cfg.trendEmaPeriod) + 2;
  // Simple EMA over closes for the trend filter.
  const emaArr = ema(closes, cfg.trendEmaPeriod);
  for (let i = need; i < candles.length - 1; i++) {
    const window = closes.slice(0, i + 1);
    const cr = connorsRSI(window, cfg);
    const trend = emaArr[i];
    const atr = atrs[i];
    if (cr == null || trend == null || atr == null || atr <= 0) continue;
    const price = closes[i];
    const bullish = closes[i] >= closes[i - 1];
    if (price > trend && cr <= cfg.oversold && bullish) {
      const entry = candles[i + 1].o;
      const stop = entry - atr * slMult;
      signals.push({ idx: i, direction: "LONG", entry, stop, target: entry + Math.abs(entry - stop) * rr });
    } else if (price < trend && cr >= cfg.overbought && !bullish) {
      const entry = candles[i + 1].o;
      const stop = entry + atr * slMult;
      signals.push({ idx: i, direction: "SHORT", entry, stop, target: entry - Math.abs(entry - stop) * rr });
    }
  }
  return signals;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}
