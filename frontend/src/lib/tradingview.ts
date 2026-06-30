// Map our Kite instrument keys + intervals to TradingView Advanced Chart widget
// symbols/intervals. Best-effort: equities and the common NSE/BSE indices map
// cleanly; F&O and anything unusual fall back to a stripped EXCH:SYM and the
// widget's symbol search (allow_symbol_change) lets the user correct it.

const INDEX_MAP: Record<string, string> = {
  "NSE:NIFTY 50": "NSE:NIFTY",
  "NSE:NIFTY BANK": "NSE:BANKNIFTY",
  "NSE:NIFTY FIN SERVICE": "NSE:NIFTY_FIN_SERVICE",
  "NSE:NIFTY MIDCAP 50": "NSE:NIFTY_MIDCAP_50",
  "NSE:NIFTY MIDCAP SELECT": "NSE:NIFTYMIDSELECT",
  "NSE:NIFTY NEXT 50": "NSE:NIFTY_NEXT_50",
  "NSE:INDIA VIX": "NSE:INDIAVIX",
  "BSE:SENSEX": "BSE:SENSEX",
  "BSE:BANKEX": "BSE:BANKEX",
};

/** Kite instrument key (EXCHANGE:SYMBOL) → TradingView symbol. */
export function tvSymbol(key: string): string {
  if (!key) return "";
  if (INDEX_MAP[key]) return INDEX_MAP[key];
  const i = key.indexOf(":");
  if (i < 0) return key;
  const exch = key.slice(0, i).toUpperCase();
  const sym = key.slice(i + 1).trim();
  // Plain equities map 1:1; everything else gets spaces collapsed (best-effort).
  if ((exch === "NSE" || exch === "BSE") && /^[A-Z0-9&-]+$/.test(sym)) return `${exch}:${sym}`;
  return `${exch}:${sym.replace(/\s+/g, "")}`;
}

/** Our timeframe → TradingView interval code. */
export function tvInterval(interval: string): string {
  const m: Record<string, string> = {
    "1minute": "1",
    "3minute": "3",
    "5minute": "5",
    "15minute": "15",
    "30minute": "30",
    "60minute": "60",
    day: "D",
  };
  return m[interval] ?? "5";
}
