"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { api } from "@/lib/apiClient";
import { changeTextClass, num, pct } from "@/lib/format";
import { useAiScanners } from "@/lib/aiScanners";

interface WatchItem {
  instrument: string;
  displayName: string;
  exchange: string;
}

interface LiveQuote {
  ltp: number;
  changePercent: number | null;
}

const STORAGE_KEY = "watchlist.v1";
const DEFAULT_ITEMS: WatchItem[] = [
  { instrument: "NSE:RELIANCE", displayName: "RELIANCE", exchange: "NSE" },
  { instrument: "NSE:INFY", displayName: "INFY", exchange: "NSE" },
];

/**
 * Live watchlist (Phase 3D). Add instruments via the shared search, remove
 * them, and (when Kite is authorised) show live LTP via the batch-quote
 * endpoint. Persists to localStorage. READ-ONLY — no trade buttons.
 */
export function LiveWatchlist() {
  const { value: items, setValue: setItems, hydrated } = useLocalStorage<WatchItem[]>(STORAGE_KEY, DEFAULT_ITEMS);
  const scanners = useAiScanners();
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refreshQuotes = useCallback(async () => {
    if (items.length === 0) {
      setQuotes({});
      return;
    }
    try {
      const res = await api.kite.quotes(items.map((i) => i.instrument));
      const next: Record<string, LiveQuote> = {};
      for (const [key, q] of Object.entries(res.data)) {
        const ltp = typeof q.last_price === "number" ? q.last_price : 0;
        const close = q.ohlc?.close;
        const cp = typeof close === "number" && close > 0 ? ((ltp - close) / close) * 100 : null;
        next[key] = { ltp, changePercent: cp };
      }
      setQuotes(next);
      setLive(true);
      setNote(res.missing.length ? `No live data for: ${res.missing.join(", ")}` : null);
    } catch {
      // Kite not authorised / disabled — show the list without live prices.
      setLive(false);
      setNote("Live prices need Kite enabled & authorised. Showing saved instruments only.");
    }
  }, [items]);

  useEffect(() => {
    if (hydrated) void refreshQuotes();
  }, [hydrated, refreshQuotes]);

  const [openedNote, setOpenedNote] = useState<string | null>(null);
  const handleAnalyse = (it: WatchItem) => {
    const existed = scanners.has(it.instrument);
    scanners.open({ instrument: it.instrument, displayName: it.displayName, exchange: it.exchange });
    const msg = existed ? `Assistant focused for ${it.displayName}.` : `AI Trade Assistant opened for ${it.displayName}.`;
    setOpenedNote(msg);
    window.setTimeout(() => setOpenedNote((n) => (n === msg ? null : n)), 5000);
  };

  const add = (ins: SelectedInstrument) => {
    setItems((cur) =>
      cur.some((i) => i.instrument === ins.instrument)
        ? cur
        : [...cur, { instrument: ins.instrument, displayName: ins.displayName, exchange: ins.exchange }],
    );
  };
  const remove = (instrument: string) => setItems((cur) => cur.filter((i) => i.instrument !== instrument));

  return (
    <Card
      id="watchlist"
      eyebrow="Live list"
      title="Watchlist"
      subtitle="Add any instrument · live LTP when Kite is authorised"
      action={
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            live ? "border-bull/30 bg-bull-soft text-bull" : "border-white/10 bg-base-800 text-slate-400"
          }`}
        >
          {live ? "LIVE" : "SAVED"}
        </span>
      }
    >
      <InstrumentSearch onSelect={add} placeholder="Add to watchlist… (e.g. TCS, NIFTY, BANKNIFTY FUT)" />

      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}

      {openedNote && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
          <span>🪟 {openedNote}</span>
          <button type="button" onClick={() => setOpenedNote(null)} aria-label="Dismiss" className="shrink-0 text-accent/70 hover:text-accent">✕</button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Your watchlist is empty. Search above to add instruments.
          </p>
        ) : (
          <table className="w-full min-w-[300px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-medium">Instrument</th>
                <th className="px-2 py-2 text-right font-medium">LTP</th>
                <th className="px-2 py-2 text-right font-medium">Chg</th>
                <th className="px-2 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((it) => {
                const q = quotes[it.instrument];
                return (
                  <tr key={it.instrument} className="transition-colors hover:bg-white/5">
                    <td className="px-2 py-2.5">
                      <p className="text-[15px] font-semibold text-slate-100">{it.displayName}</p>
                      <p className="num text-[11px] text-slate-500">{it.instrument}</p>
                    </td>
                    <td className="num px-2 py-2.5 text-right text-[15px] font-semibold text-slate-100">
                      {q ? num(q.ltp) : "—"}
                    </td>
                    <td className={`num px-2 py-2.5 text-right ${q?.changePercent != null ? changeTextClass(q.changePercent) : "text-slate-500"}`}>
                      {q?.changePercent != null ? pct(q.changePercent) : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAnalyse(it)}
                          title="Open floating AI Trade Assistant"
                          aria-label={`Analyse ${it.displayName}`}
                          className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                            scanners.has(it.instrument) ? "border-accent/40 bg-accent/10 text-accent" : "border-accent/30 text-accent hover:bg-accent/10"
                          }`}
                        >
                          {scanners.has(it.instrument) ? "Open ▸" : "Analyse"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(it.instrument)}
                          aria-label={`Remove ${it.displayName}`}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-400 transition-colors hover:border-bear/30 hover:text-bear"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
