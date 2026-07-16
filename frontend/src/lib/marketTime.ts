// Market-time formatting. Takes an EPOCH instant (ms) from the backend and
// renders it in the market timezone (Asia/Kolkata by default, config-driven)
// EXACTLY ONCE — no browser-Date guessing, no double IST conversion. Milliseconds
// are shown only when the source actually has sub-second precision.

const DEFAULT_TZ = "Asia/Kolkata";

/** Format an epoch-ms instant as "hh:mm:ss[.SSS] am/pm" in `timezone`. */
export function fmtMarketTime(ms: number | null | undefined, timezone: string = DEFAULT_TZ, showMillis = true): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, hourCycle: "h23" }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hh = Number(g("hour"));
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const ap = hh < 12 ? "am" : "pm";
  const millis = new Date(ms).getMilliseconds(); // ms component is tz-invariant
  const msStr = showMillis && millis ? `.${String(millis).padStart(3, "0")}` : "";
  return `${String(h12).padStart(2, "0")}:${g("minute")}:${g("second")}${msStr} ${ap}`;
}

/** "02:20:00 pm candle" — labels a candle-precision time (not an exact tick). */
export function fmtCandleWindow(startMs: number | null | undefined, timezone: string = DEFAULT_TZ): string | null {
  const t = fmtMarketTime(startMs, timezone, false);
  return t ? `${t} candle` : null;
}

/** Date (YYYY-MM-DD) of an instant in `timezone`. */
export function marketDateKey(ms: number | null | undefined, timezone: string = DEFAULT_TZ): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
