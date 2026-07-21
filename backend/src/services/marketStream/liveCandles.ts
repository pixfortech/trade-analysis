// =====================================================================
// Live candle engine (PURE, no I/O) — builds OHLCV candles from Kite ticks.
// ---------------------------------------------------------------------
// Historical REST candles SEED the series once (for indicator warm-up); after
// that every tick folds into the current forming candle, and at each interval
// boundary the forming candle is finalised and the next one begins — with no
// further REST refresh (§3–§6, §17). Indicators/decision read this unified series
// so they never operate on an older candle set than the live CMP (§7).
//
// Kite `full` ticks carry the CUMULATIVE day volume, so per-candle volume is the
// delta from the cumulative value captured when the candle opened. Index ticks
// carry no volume → v stays 0. Candle `t` is an absolute ISO instant (Date.parse
// works), matching the REST candle shape the downstream code already consumes.
// =====================================================================

export interface Candle {
  t: string; // ISO instant of the candle open (Date.parse-able)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Forming {
  boundaryMs: number;
  o: number;
  h: number;
  l: number;
  c: number;
  startCum: number | null; // cumulative volume captured at candle open
  v: number;
}

export class LiveCandleSeries {
  private history: Candle[] = []; // finalised candles (oldest → newest)
  private forming: Forming | null = null;
  private lastTick = 0;
  private seeded = false;

  constructor(
    private readonly intervalMs: number,
    private readonly maxCandles = 500,
  ) {
    if (!(intervalMs > 0)) throw new Error("intervalMs must be > 0");
  }

  /** Seed finalised history from REST (once, or to fill a reconnect gap). Drops
   *  any partial forming candle so ticks rebuild it from the fresh baseline. */
  seed(candles: Candle[]): void {
    const clean = candles.filter((c) => c && Number.isFinite(Date.parse(c.t)));
    this.history = clean.slice(-this.maxCandles);
    this.forming = null;
    this.seeded = true;
  }

  isSeeded(): boolean {
    return this.seeded;
  }
  lastTickMs(): number {
    return this.lastTick;
  }

  /** Fold one tick. `cumVolume` is the cumulative day volume (Kite full mode). */
  onTick(tickMs: number, price: number, cumVolume: number | null = null): void {
    if (!Number.isFinite(tickMs) || !Number.isFinite(price)) return;
    this.lastTick = Math.max(this.lastTick, tickMs);
    const boundaryMs = Math.floor(tickMs / this.intervalMs) * this.intervalMs;

    if (!this.forming) {
      this.forming = this.openCandle(boundaryMs, price, cumVolume);
      return;
    }
    if (boundaryMs > this.forming.boundaryMs) {
      // Interval rolled over — finalise the forming candle and open the next.
      this.finalise();
      this.forming = this.openCandle(boundaryMs, price, cumVolume);
      return;
    }
    if (boundaryMs < this.forming.boundaryMs) return; // out-of-order tick — ignore

    // Same candle — update H/L/C and accumulated volume.
    this.forming.h = Math.max(this.forming.h, price);
    this.forming.l = Math.min(this.forming.l, price);
    this.forming.c = price;
    if (cumVolume != null) {
      if (this.forming.startCum == null) this.forming.startCum = cumVolume;
      this.forming.v = Math.max(0, cumVolume - this.forming.startCum);
    }
  }

  private openCandle(boundaryMs: number, price: number, cumVolume: number | null): Forming {
    return { boundaryMs, o: price, h: price, l: price, c: price, startCum: cumVolume, v: 0 };
  }

  private finalise(): void {
    if (!this.forming) return;
    const f = this.forming;
    this.history.push({ t: new Date(f.boundaryMs).toISOString(), o: f.o, h: f.h, l: f.l, c: f.c, v: f.v });
    if (this.history.length > this.maxCandles) this.history = this.history.slice(-this.maxCandles);
    this.forming = null;
  }

  /** The full series: finalised history + the current forming candle (if any). */
  candles(): Candle[] {
    if (!this.forming) return this.history.slice();
    const f = this.forming;
    return [...this.history, { t: new Date(f.boundaryMs).toISOString(), o: f.o, h: f.h, l: f.l, c: f.c, v: f.v }];
  }

  /** Boundary (epoch ms) of the current forming candle, or null. */
  formingBoundaryMs(): number | null {
    return this.forming ? this.forming.boundaryMs : null;
  }

  /** True when the newest data is within `warmMs` of `now` — i.e. ticks are live
   *  and this series (not REST) should be the candle source. */
  isWarm(warmMs: number, now: number): boolean {
    return this.seeded && this.lastTick > 0 && now - this.lastTick <= warmMs;
  }

  size(): number {
    return this.history.length + (this.forming ? 1 : 0);
  }
}
