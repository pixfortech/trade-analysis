// Indicator configuration model + a single compute entry point. Instances are
// user-configurable (type + params + colour + enabled) and persisted in
// localStorage. computeIndicator() returns a normalised result used by BOTH the
// chart (overlays/volume) and the oscillator readouts — one source of truth.

import {
  type Candle,
  type Num,
  adx,
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  stochastic,
  supertrend,
  vwap,
  wma,
} from "./indicators";

export type IndicatorType = "EMA" | "SMA" | "WMA" | "VWAP" | "BOLL" | "SUPERTREND" | "VOLUME" | "RSI" | "MACD" | "STOCH" | "ATR" | "ADX";
export type Pane = "price" | "volume" | "lower";

interface ParamDef { key: string; label: string; def: number; min: number; max: number }
export interface IndicatorDef { type: IndicatorType; label: string; pane: Pane; params: ParamDef[] }

const L = (def: number, max = 400): ParamDef => ({ key: "length", label: "Length", def, min: 1, max });

export const INDICATOR_DEFS: Record<IndicatorType, IndicatorDef> = {
  EMA: { type: "EMA", label: "EMA", pane: "price", params: [L(20)] },
  SMA: { type: "SMA", label: "SMA", pane: "price", params: [L(50)] },
  WMA: { type: "WMA", label: "WMA", pane: "price", params: [L(20)] },
  VWAP: { type: "VWAP", label: "VWAP", pane: "price", params: [] },
  BOLL: { type: "BOLL", label: "Bollinger", pane: "price", params: [L(20), { key: "mult", label: "StdDev", def: 2, min: 1, max: 5 }] },
  SUPERTREND: { type: "SUPERTREND", label: "Supertrend", pane: "price", params: [{ key: "length", label: "Length", def: 10, min: 1, max: 100 }, { key: "mult", label: "Mult", def: 3, min: 1, max: 10 }] },
  VOLUME: { type: "VOLUME", label: "Volume", pane: "volume", params: [{ key: "maLength", label: "MA", def: 20, min: 1, max: 200 }] },
  RSI: { type: "RSI", label: "RSI", pane: "lower", params: [L(14, 100)] },
  MACD: { type: "MACD", label: "MACD", pane: "lower", params: [{ key: "fast", label: "Fast", def: 12, min: 1, max: 100 }, { key: "slow", label: "Slow", def: 26, min: 2, max: 200 }, { key: "signal", label: "Signal", def: 9, min: 1, max: 100 }] },
  STOCH: { type: "STOCH", label: "Stochastic", pane: "lower", params: [{ key: "k", label: "%K", def: 14, min: 1, max: 100 }, { key: "d", label: "%D", def: 3, min: 1, max: 50 }] },
  ATR: { type: "ATR", label: "ATR", pane: "lower", params: [L(14, 100)] },
  ADX: { type: "ADX", label: "ADX", pane: "lower", params: [L(14, 100)] },
};

export const INDICATOR_ORDER: IndicatorType[] = ["EMA", "SMA", "WMA", "VWAP", "BOLL", "SUPERTREND", "VOLUME", "RSI", "MACD", "STOCH", "ATR", "ADX"];

export interface IndicatorInstance { id: string; type: IndicatorType; params: Record<string, number>; enabled: boolean; color: string }

const COLORS: Partial<Record<IndicatorType, string>> = { VWAP: "#f0b90b", EMA: "#5b82ee", SMA: "#a855f7", WMA: "#22d3ee", BOLL: "#94a3b8", SUPERTREND: "#12b76a" };
const PALETTE = ["#5b82ee", "#f0b90b", "#a855f7", "#22d3ee", "#f97316", "#ec4899", "#10b981", "#eab308"];

export function defaultParams(type: IndicatorType): Record<string, number> {
  const p: Record<string, number> = {};
  for (const d of INDICATOR_DEFS[type].params) p[d.key] = d.def;
  return p;
}

/** Deterministic id from type + params, e.g. "EMA:20", "MACD:12/26/9". */
export function instanceId(type: IndicatorType, params: Record<string, number>): string {
  const ps = INDICATOR_DEFS[type].params.map((d) => params[d.key]).join("/");
  return ps ? `${type}:${ps}` : type;
}

export function instanceLabel(inst: IndicatorInstance): string {
  const def = INDICATOR_DEFS[inst.type];
  const ps = def.params.map((d) => inst.params[d.key]).join("/");
  return ps ? `${def.label} ${ps}` : def.label;
}

export function makeInstance(type: IndicatorType, params?: Record<string, number>, color?: string): IndicatorInstance {
  const p = params ?? defaultParams(type);
  return { id: instanceId(type, p), type, params: p, enabled: true, color: color ?? COLORS[type] ?? PALETTE[INDICATOR_ORDER.indexOf(type) % PALETTE.length] };
}

export const DEFAULT_INDICATORS: IndicatorInstance[] = [
  makeInstance("VWAP"),
  makeInstance("EMA", { length: 20 }, "#5b82ee"),
  makeInstance("EMA", { length: 50 }, "#a855f7"),
  makeInstance("SUPERTREND"),
  makeInstance("VOLUME"),
  makeInstance("RSI"),
  makeInstance("MACD"),
];

/* --------------------------------- compute ------------------------------- */
export interface IndLine { name: string; color: string; values: Num[] }
export interface IndReadout { label: string; value: string; tone: "bull" | "bear" | "neutral" }
export interface IndicatorResult {
  pane: Pane;
  lines: IndLine[]; // line series (price overlays or oscillator lines)
  hist?: { name: string; values: Num[] }; // histogram (MACD hist, volume)
  readouts: IndReadout[]; // latest values for compact cards
  insufficient: boolean;
}

const close = (cs: Candle[]) => cs.map((c) => c.c);
const last = (a: Num[]): Num => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i];
  return null;
};
const fmt = (n: Num, d = 2) => (n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(n));
const allNull = (a: Num[]) => a.every((x) => x == null);

export function computeIndicator(inst: IndicatorInstance, candles: Candle[]): IndicatorResult {
  const p = inst.params;
  const color = inst.color;
  switch (inst.type) {
    case "EMA":
    case "SMA":
    case "WMA": {
      const fn = inst.type === "EMA" ? ema : inst.type === "SMA" ? sma : wma;
      const vals = fn(close(candles), p.length);
      return { pane: "price", lines: [{ name: inst.type, color, values: vals }], readouts: [], insufficient: allNull(vals) };
    }
    case "VWAP": {
      const vals = vwap(candles);
      return { pane: "price", lines: [{ name: "VWAP", color, values: vals }], readouts: [], insufficient: allNull(vals) };
    }
    case "BOLL": {
      const b = bollinger(close(candles), p.length, p.mult);
      return {
        pane: "price",
        lines: [
          { name: "Upper", color, values: b.map((x) => x.upper) },
          { name: "Mid", color, values: b.map((x) => x.mid) },
          { name: "Lower", color, values: b.map((x) => x.lower) },
        ],
        readouts: [],
        insufficient: b.every((x) => x.mid == null),
      };
    }
    case "SUPERTREND": {
      const st = supertrend(candles, p.length, p.mult);
      return {
        pane: "price",
        lines: [
          { name: "ST up", color: "#12b76a", values: st.map((x) => (x.dir === 1 ? x.value : null)) },
          { name: "ST down", color: "#f04438", values: st.map((x) => (x.dir === -1 ? x.value : null)) },
        ],
        readouts: [],
        insufficient: st.every((x) => x.value == null),
      };
    }
    case "VOLUME": {
      const vol = candles.map((c) => c.v);
      const ma = sma(vol, p.maLength);
      const lv = candles.length ? candles[candles.length - 1].v : 0;
      const lma = last(ma);
      return {
        pane: "volume",
        lines: [{ name: "Vol MA", color: "#f0b90b", values: ma }],
        hist: { name: "Volume", values: vol },
        readouts: [{ label: "Vol vs MA", value: lma ? `${(lv / lma).toFixed(2)}×` : "—", tone: lma && lv > lma ? "bull" : "neutral" }],
        insufficient: candles.length === 0,
      };
    }
    case "RSI": {
      const vals = rsi(close(candles), p.length);
      const lv = last(vals);
      return { pane: "lower", lines: [{ name: "RSI", color: "#5b82ee", values: vals }], readouts: [{ label: `RSI ${p.length}`, value: fmt(lv), tone: lv == null ? "neutral" : lv > 55 ? "bull" : lv < 45 ? "bear" : "neutral" }], insufficient: allNull(vals) };
    }
    case "MACD": {
      const m = macd(close(candles), p.fast, p.slow, p.signal);
      const h = last(m.map((x) => x.hist));
      return {
        pane: "lower",
        lines: [
          { name: "MACD", color: "#5b82ee", values: m.map((x) => x.macd) },
          { name: "Signal", color: "#f0b90b", values: m.map((x) => x.signal) },
        ],
        hist: { name: "Hist", values: m.map((x) => x.hist) },
        readouts: [{ label: "MACD hist", value: fmt(h), tone: h == null ? "neutral" : h > 0 ? "bull" : "bear" }],
        insufficient: m.every((x) => x.macd == null),
      };
    }
    case "STOCH": {
      const s = stochastic(candles, p.k, p.d);
      const k = last(s.map((x) => x.k));
      return {
        pane: "lower",
        lines: [
          { name: "%K", color: "#5b82ee", values: s.map((x) => x.k) },
          { name: "%D", color: "#f0b90b", values: s.map((x) => x.d) },
        ],
        readouts: [{ label: `Stoch ${p.k}/${p.d}`, value: fmt(k), tone: k == null ? "neutral" : k > 80 ? "bear" : k < 20 ? "bull" : "neutral" }],
        insufficient: s.every((x) => x.k == null),
      };
    }
    case "ATR": {
      const vals = atr(candles, p.length);
      const lv = last(vals);
      const cmp = candles.length ? candles[candles.length - 1].c : 0;
      return { pane: "lower", lines: [{ name: "ATR", color: "#f97316", values: vals }], readouts: [{ label: `ATR ${p.length}`, value: lv == null ? "—" : `${fmt(lv)}${cmp ? ` · ${((lv / cmp) * 100).toFixed(2)}%` : ""}`, tone: "neutral" }], insufficient: allNull(vals) };
    }
    case "ADX": {
      const a = adx(candles, p.length);
      const adxV = last(a.map((x) => x.adx));
      const pdi = last(a.map((x) => x.plusDI));
      const mdi = last(a.map((x) => x.minusDI));
      return {
        pane: "lower",
        lines: [
          { name: "ADX", color: "#94a3b8", values: a.map((x) => x.adx) },
          { name: "+DI", color: "#12b76a", values: a.map((x) => x.plusDI) },
          { name: "-DI", color: "#f04438", values: a.map((x) => x.minusDI) },
        ],
        readouts: [{ label: `ADX ${p.length}`, value: adxV == null ? "—" : `${fmt(adxV)}${pdi != null && mdi != null ? (pdi > mdi ? " ↑" : " ↓") : ""}`, tone: adxV == null ? "neutral" : pdi != null && mdi != null ? (pdi > mdi ? "bull" : "bear") : "neutral" }],
        insufficient: a.every((x) => x.adx == null),
      };
    }
    default:
      return { pane: "price", lines: [], readouts: [], insufficient: true };
  }
}
