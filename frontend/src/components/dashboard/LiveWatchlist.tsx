"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { DsCard, DsBadge, Icon } from "@/components/terminal/ds";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { api } from "@/lib/apiClient";
import { num, pct } from "@/lib/format";
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
 * Live watchlist — modern terminal table built from the design's WatchlistRow.
 * Add instruments via the shared search, remove them, and (when Kite is
 * authorised) show live LTP via the batch-quote endpoint. Persists to
 * localStorage. READ-ONLY — Analyse opens a floating assistant, no trade buttons.
 */
export function LiveWatchlist() {
  const { value: items, setValue: setItems, hydrated } = useLocalStorage<WatchItem[]>(STORAGE_KEY, DEFAULT_ITEMS);
  const scanners = useAiScanners();
  const g = useGlobalControls();
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

  // Live-gated quote polling — paused when the global Live toggle is OFF. The
  // manual Refresh button still works regardless.
  useEffect(() => {
    if (!hydrated || !g.liveUpdates) return;
    const id = window.setInterval(() => void refreshQuotes(), 12_000);
    return () => window.clearInterval(id);
  }, [hydrated, g.liveUpdates, refreshQuotes]);

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
    <DsCard
      padding="none"
      eyebrow="Watchlist"
      title="Tracked instruments"
      headerRight={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DsBadge tone={!g.liveUpdates ? "avoid" : live ? "enter" : "neutral"} dot>{!g.liveUpdates ? "Paused" : live ? "Live" : "Saved"}</DsBadge>
          <button type="button" onClick={() => void refreshQuotes()} title="Refresh quotes now" aria-label="Refresh quotes"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", cursor: "pointer", flexShrink: 0 }}>
            <Icon n="refresh" size={14} />
          </button>
        </span>
      }
    >
      <div style={{ padding: "12px 12px 4px" }}>
        <InstrumentSearch onSelect={add} placeholder="Add… (TCS, NIFTY, BANKNIFTY FUT)" />
      </div>

      {note && <p style={{ padding: "4px 14px", fontSize: 11, color: "var(--ink-3)" }}>{note}</p>}
      {openedNote && (
        <div style={{ margin: "4px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--action-wait-soft)", border: "1px solid var(--action-wait-border)", color: "var(--action-wait-strong)", fontSize: 12 }}>
          <span>🪟 {openedNote}</span>
          <button type="button" onClick={() => setOpenedNote(null)} aria-label="Dismiss" style={iconBtn}>✕</button>
        </div>
      )}

      <div style={{ padding: "6px 6px 10px", maxHeight: 460, overflowY: "auto" }}>
        {items.length === 0 ? (
          <p style={{ padding: "28px 12px", textAlign: "center", fontSize: 13, color: "var(--ink-3)" }}>Your watchlist is empty. Search above to add instruments.</p>
        ) : (
          items.map((it) => (
            <WatchRow
              key={it.instrument}
              symbol={it.displayName}
              segment={it.exchange}
              quote={quotes[it.instrument]}
              open={scanners.has(it.instrument)}
              onAnalyse={() => handleAnalyse(it)}
              onRemove={() => remove(it.instrument)}
            />
          ))
        )}
      </div>
    </DsCard>
  );
}

const iconBtn: CSSProperties = { border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-4)", fontSize: 12, lineHeight: 1, padding: 2 };

/** One watchlist row — design WatchlistRow layout (symbol · price · action). */
function WatchRow({ symbol, segment, quote, open, onAnalyse, onRemove }: {
  symbol: string; segment: string; quote?: LiveQuote; open: boolean; onAnalyse: () => void; onRemove: () => void;
}) {
  const cp = quote?.changePercent ?? null;
  const down = cp != null && cp < 0;
  return (
    <div
      onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "var(--surface-sunken)"; }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
      style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 10, padding: "10px 10px 10px 16px", borderRadius: "var(--radius-sm)", background: open ? "var(--brand-50)" : "transparent", transition: "background var(--dur-fast) var(--ease-out)" }}
    >
      {open && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: 2, background: "var(--brand-500)" }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{symbol}</div>
        <div className="eyebrow" style={{ color: "var(--ink-4)" }}>{segment}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="num" style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)" }}>{quote ? num(quote.ltp) : "—"}</div>
        <div className="num" style={{ fontSize: 11, fontWeight: 700, color: cp == null ? "var(--ink-4)" : down ? "var(--price-down)" : "var(--price-up)" }}>
          {cp == null ? "—" : `${down ? "▼" : "▲"} ${pct(cp)}`}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button type="button" onClick={onAnalyse} title="Open floating AI Trade Assistant" aria-label={`Analyse ${symbol}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 9px", borderRadius: "var(--radius-sm)", border: `1px solid ${open ? "var(--brand-500)" : "var(--action-wait-border)"}`, background: open ? "var(--brand-500)" : "var(--action-wait-soft)", color: open ? "#fff" : "var(--action-wait-strong)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
          <Icon n="bot" size={13} />{open ? "Open" : "Analyse"}
        </button>
        <button type="button" onClick={onRemove} title="Remove" aria-label={`Remove ${symbol}`} style={{ ...iconBtn, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-sm)" }}>
          <Icon n="x" size={14} />
        </button>
      </div>
    </div>
  );
}
