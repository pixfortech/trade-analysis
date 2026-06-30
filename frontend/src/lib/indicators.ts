// Native technical-indicator math — pure, dependency-free functions over OHLCV
// candles. All return arrays aligned 1:1 with the input (null during warm-up, so
// nothing is fabricated). Used by the Kite lightweight-charts chart so indicators
// stay aligned with our locked Entry/SL/Target levels.

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Num = number | null;

/** Simple moving average. */
export function sma(vals: number[], len: number): Num[] {
  const out: Num[] = new Array(vals.length).fill(null);
  if (len <= 0) return out;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= len) sum -= vals[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

/** Exponential moving average (SMA-seeded). */
export function ema(vals: number[], len: number): Num[] {
  const out: Num[] = new Array(vals.length).fill(null);
  if (len <= 0 || vals.length < len) return out;
  const k = 2 / (len + 1);
  let prev = 0;
  for (let i = 0; i < len; i++) prev += vals[i];
  prev /= len;
  out[len - 1] = prev;
  for (let i = len; i < vals.length; i++) {
    prev = vals[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Weighted moving average. */
export function wma(vals: number[], len: number): Num[] {
  const out: Num[] = new Array(vals.length).fill(null);
  if (len <= 0) return out;
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < vals.length; i++) {
    let s = 0;
    for (let j = 0; j < len; j++) s += vals[i - j] * (len - j);
    out[i] = s / denom;
  }
  return out;
}

/** Session VWAP — cumulative typical-price × volume, reset each calendar day. */
export function vwap(candles: Candle[]): Num[] {
  const out: Num[] = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  let day = "";
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const d = c.t.slice(0, 10);
    if (d !== day) {
      day = d;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (c.h + c.l + c.c) / 3;
    cumPV += tp * c.v;
    cumV += c.v;
    out[i] = cumV > 0 ? cumPV / cumV : null;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(close: number[], len: number): Num[] {
  const out: Num[] = new Array(close.length).fill(null);
  if (len <= 0 || close.length <= len) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= len; i++) {
    const ch = close[i] - close[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  gain /= len;
  loss /= len;
  out[len] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = len + 1; i < close.length; i++) {
    const ch = close[i] - close[i - 1];
    gain = (gain * (len - 1) + (ch > 0 ? ch : 0)) / len;
    loss = (loss * (len - 1) + (ch < 0 ? -ch : 0)) / len;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export interface MacdPoint { macd: Num; signal: Num; hist: Num }
/** MACD = EMA(fast) − EMA(slow); signal = EMA(MACD); hist = MACD − signal. */
export function macd(close: number[], fast = 12, slow = 26, signal = 9): MacdPoint[] {
  const ef = ema(close, fast);
  const es = ema(close, slow);
  const m: Num[] = close.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null));
  const sig: Num[] = new Array(close.length).fill(null);
  const first = m.findIndex((x) => x != null);
  if (first >= 0) {
    const se = ema(m.slice(first).map((x) => x ?? 0), signal);
    for (let i = 0; i < se.length; i++) sig[first + i] = se[i];
  }
  return close.map((_, i) => ({ macd: m[i], signal: sig[i], hist: m[i] != null && sig[i] != null ? m[i]! - sig[i]! : null }));
}

/** True range per candle. */
export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => (i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c))));
}

/** Wilder's ATR. */
export function atr(candles: Candle[], len: number): Num[] {
  const tr = trueRange(candles);
  const out: Num[] = new Array(candles.length).fill(null);
  if (len <= 0 || candles.length <= len) return out;
  let a = 0;
  for (let i = 1; i <= len; i++) a += tr[i];
  a /= len;
  out[len] = a;
  for (let i = len + 1; i < candles.length; i++) {
    a = (a * (len - 1) + tr[i]) / len;
    out[i] = a;
  }
  return out;
}

export interface BollPoint { mid: Num; upper: Num; lower: Num }
/** Bollinger Bands (SMA ± mult·stdev). */
export function bollinger(close: number[], len: number, mult: number): BollPoint[] {
  const mid = sma(close, len);
  return close.map((_, i) => {
    if (mid[i] == null) return { mid: null, upper: null, lower: null };
    let s = 0;
    for (let j = i - len + 1; j <= i; j++) s += (close[j] - mid[i]!) ** 2;
    const sd = Math.sqrt(s / len);
    return { mid: mid[i], upper: mid[i]! + mult * sd, lower: mid[i]! - mult * sd };
  });
}

export interface SupertrendPoint { value: Num; dir: 1 | -1 | null }
/** Supertrend (ATR bands; dir 1 = up/green, -1 = down/red). */
export function supertrend(candles: Candle[], period: number, mult: number): SupertrendPoint[] {
  const n = candles.length;
  const at = atr(candles, period);
  const fUpper: number[] = new Array(n).fill(0);
  const fLower: number[] = new Array(n).fill(0);
  const st: Num[] = new Array(n).fill(null);
  const dir: (1 | -1 | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (at[i] == null) continue;
    const hl2 = (candles[i].h + candles[i].l) / 2;
    const bUp = hl2 + mult * at[i]!;
    const bLo = hl2 - mult * at[i]!;
    const prevC = i > 0 ? candles[i - 1].c : candles[i].c;
    const prevFU = i > 0 && fUpper[i - 1] ? fUpper[i - 1] : bUp;
    const prevFL = i > 0 && fLower[i - 1] ? fLower[i - 1] : bLo;
    fUpper[i] = bUp < prevFU || prevC > prevFU ? bUp : prevFU;
    fLower[i] = bLo > prevFL || prevC < prevFL ? bLo : prevFL;
    if (st[i - 1] == null) {
      dir[i] = candles[i].c <= fUpper[i] ? -1 : 1;
    } else if (st[i - 1] === fUpper[i - 1]) {
      dir[i] = candles[i].c > fUpper[i] ? 1 : -1;
    } else {
      dir[i] = candles[i].c < fLower[i] ? -1 : 1;
    }
    st[i] = dir[i] === 1 ? fLower[i] : fUpper[i];
  }
  return candles.map((_, i) => ({ value: st[i], dir: dir[i] }));
}

export interface StochPoint { k: Num; d: Num }
/** Stochastic %K / %D. */
export function stochastic(candles: Candle[], kLen: number, dLen: number): StochPoint[] {
  const n = candles.length;
  const kArr: Num[] = new Array(n).fill(null);
  for (let i = kLen - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].h);
      ll = Math.min(ll, candles[j].l);
    }
    kArr[i] = hh === ll ? 50 : ((candles[i].c - ll) / (hh - ll)) * 100;
  }
  const dRaw = sma(kArr.map((x) => x ?? 0), dLen);
  return candles.map((_, i) => ({ k: kArr[i], d: kArr[i] == null ? null : dRaw[i] }));
}

export interface AdxPoint { adx: Num; plusDI: Num; minusDI: Num }
/** Wilder's ADX with +DI / −DI. */
export function adx(candles: Candle[], len: number): AdxPoint[] {
  const n = candles.length;
  const tr = trueRange(candles);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].h - candles[i - 1].h;
    const down = candles[i - 1].l - candles[i].l;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const smooth = (arr: number[]): Num[] => {
    const out: Num[] = new Array(n).fill(null);
    if (n <= len) return out;
    let s = 0;
    for (let i = 1; i <= len; i++) s += arr[i];
    out[len] = s;
    for (let i = len + 1; i < n; i++) {
      s = s - s / len + arr[i];
      out[i] = s;
    }
    return out;
  };
  const trS = smooth(tr);
  const pS = smooth(plusDM);
  const mS = smooth(minusDM);
  const plusDI: Num[] = new Array(n).fill(null);
  const minusDI: Num[] = new Array(n).fill(null);
  const dx: Num[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (trS[i] != null && trS[i]! > 0) {
      plusDI[i] = 100 * (pS[i]! / trS[i]!);
      minusDI[i] = 100 * (mS[i]! / trS[i]!);
      const sum = plusDI[i]! + minusDI[i]!;
      dx[i] = sum > 0 ? (100 * Math.abs(plusDI[i]! - minusDI[i]!)) / sum : 0;
    }
  }
  const adxArr: Num[] = new Array(n).fill(null);
  const first = dx.findIndex((x) => x != null);
  if (first >= 0 && first + len <= n) {
    let a = 0;
    for (let i = first; i < first + len; i++) a += dx[i] ?? 0;
    a /= len;
    adxArr[first + len - 1] = a;
    for (let i = first + len; i < n; i++) {
      a = (a * (len - 1) + (dx[i] ?? 0)) / len;
      adxArr[i] = a;
    }
  }
  return candles.map((_, i) => ({ adx: adxArr[i], plusDI: plusDI[i], minusDI: minusDI[i] }));
}
