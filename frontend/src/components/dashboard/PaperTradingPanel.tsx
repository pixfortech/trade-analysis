"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import type { PaperSummary, PaperTradeView } from "@/types/api";

/**
 * Paper Trading Panel — SIMULATED ONLY (Phase 3G).
 * Opens Paper Long / Paper Short trades using a live or manual entry price.
 * NEVER places a real order. Shows open trades with live unrealised P/L
 * (polled), realised P/L on close, and a reset. Buttons are explicitly labelled.
 */
export function PaperTradingPanel() {
  const [sel, setSel] = useState<{ key: string; label: string; lot: number | null } | null>(null);
  const [entry, setEntry] = useState("");
  const [lots, setLots] = useState("1");
  const [trades, setTrades] = useState<PaperTradeView[]>([]);
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const opening = useAsync(api.paper.open);

  const refresh = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([api.paper.list(), api.paper.summary()]);
      setTrades(list.trades);
      setSummary(sum.summary);
    } catch {
      /* keep last known */
    }
  }, []);

  // Initial load + 5s live MTM polling.
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const onSelect = (ins: SelectedInstrument) => {
    setSel({ key: ins.instrument, label: ins.displayName, lot: ins.lotSize });
  };

  const openTrade = async (direction: "LONG" | "SHORT") => {
    setErr(null);
    if (!sel) {
      setErr("Select an instrument first.");
      return;
    }
    const entryPrice = Number(entry);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      setErr("Enter a valid entry price (use the live price from Live Market Signal).");
      return;
    }
    const res = await opening.run({
      instrumentKey: sel.key,
      displayName: sel.label,
      direction,
      entryPrice,
      lots: Number(lots) || 1,
      lotSize: sel.lot ?? 1,
    });
    if (res) {
      setEntry("");
      void refresh();
    }
  };

  const close = async (id: string) => {
    await api.paper.close(id);
    void refresh();
  };

  const resetAll = async () => {
    if (!window.confirm("Reset ALL paper trades? This clears your simulated book.")) return;
    await api.paper.reset();
    void refresh();
  };

  return (
    <Card
      id="paper-trading"
      title="Manual Trade Tracker"
      subtitle="Track positions with live prices — no real orders are placed"
      action={
        <span className="rounded-full border border-neutralSignal/40 bg-neutralSignal-soft px-3 py-1 text-xs font-semibold text-neutralSignal">
          SIMULATION
        </span>
      }
    >
      <InstrumentSearch onSelect={onSelect} placeholder="Instrument to paper-trade… (e.g. RELIANCE, NIFTY FUT)" />

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2 sm:col-span-2">
          <p className="text-xs text-slate-500">Selected</p>
          <p className="text-sm font-semibold text-slate-100">
            {sel ? sel.label : "None"} {sel?.lot ? <span className="num text-xs text-slate-500">· lot {sel.lot}</span> : null}
          </p>
        </div>
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="entry price"
          inputMode="decimal"
          aria-label="Entry price"
          className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2.5 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        />
        <input
          value={lots}
          onChange={(e) => setLots(e.target.value)}
          placeholder="lots"
          inputMode="numeric"
          aria-label="Lots"
          className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2.5 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openTrade("LONG")}
          disabled={opening.isLoading || !sel}
          className="rounded-lg border border-bull/40 bg-bull-soft px-4 py-2.5 text-sm font-semibold text-bull transition-colors hover:bg-bull/20 disabled:opacity-40"
        >
          Paper Buy / Long
        </button>
        <button
          type="button"
          onClick={() => void openTrade("SHORT")}
          disabled={opening.isLoading || !sel}
          className="rounded-lg border border-bear/40 bg-bear-soft px-4 py-2.5 text-sm font-semibold text-bear transition-colors hover:bg-bear/20 disabled:opacity-40"
        >
          Paper Sell / Short
        </button>
        <button
          type="button"
          onClick={() => void resetAll()}
          className="ml-auto rounded-lg border border-white/10 bg-base-800/60 px-3 py-2.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          Reset paper trades
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-bear">{err}</p>}

      {/* Summary */}
      {summary && summary.count > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Open" value={String(summary.openCount)} />
          <Stat label="Unrealised" value={num(summary.totalUnrealisedPnl)} signed={summary.totalUnrealisedPnl} />
          <Stat label="Total P/L" value={num(summary.totalPnl)} signed={summary.totalPnl} />
        </div>
      )}

      {/* Open trades */}
      <div className="mt-4">
        <OpenTrades trades={trades} onClose={close} />
      </div>

      <p className="mt-4 rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[11px] leading-relaxed text-neutralSignal">
        ⚠️ Paper trading is a simulation using live prices for mark-to-market only. No real Zerodha order is ever
        placed. P/L is an estimate, not guaranteed.
      </p>
    </Card>
  );
}

function OpenTrades({ trades, onClose }: { trades: PaperTradeView[]; onClose: (id: string) => void }) {
  if (trades.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">No paper trades yet. Open a Paper Long/Short above.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-2 py-2 font-medium">Instrument</th>
            <th className="px-2 py-2 font-medium">Side</th>
            <th className="px-2 py-2 text-right font-medium">Entry</th>
            <th className="px-2 py-2 text-right font-medium">LTP</th>
            <th className="px-2 py-2 text-right font-medium">P/L</th>
            <th className="px-2 py-2 text-right font-medium">%</th>
            <th className="px-2 py-2 text-right font-medium">Status</th>
            <th className="px-2 py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {trades.map((t) => {
            const pnl = t.status === "CLOSED" ? t.realisedPnl : t.unrealisedPnl;
            const pnlCls = pnl > 0 ? "text-bull" : pnl < 0 ? "text-bear" : "text-slate-400";
            return (
              <tr key={t.id} className="hover:bg-white/5">
                <td className="px-2 py-2.5">
                  <p className="font-medium text-slate-100">{t.displayName}</p>
                  <p className="num text-[11px] text-slate-500">{t.instrumentKey}</p>
                </td>
                <td className="px-2 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${t.direction === "LONG" ? "text-bull" : "text-bear"}`}>
                    {t.direction}
                  </span>
                </td>
                <td className="num px-2 py-2.5 text-right text-slate-200">{num(t.entryPrice)}</td>
                <td className="num px-2 py-2.5 text-right text-slate-200">{t.currentPrice != null ? num(t.currentPrice) : "—"}</td>
                <td className={`num px-2 py-2.5 text-right font-semibold ${pnlCls}`}>
                  {pnl > 0 ? "+" : ""}
                  {num(pnl)}
                </td>
                <td className={`num px-2 py-2.5 text-right ${pnlCls}`}>{t.pnlPercent}%</td>
                <td className="px-2 py-2.5 text-right text-xs text-slate-400">{t.status}</td>
                <td className="px-2 py-2.5 text-right">
                  {t.status !== "CLOSED" ? (
                    <button
                      type="button"
                      onClick={() => onClose(t.id)}
                      className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      Paper Exit
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-600">closed</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, signed }: { label: string; value: string; signed?: number }) {
  const cls = signed == null ? "text-slate-100" : signed > 0 ? "text-bull" : signed < 0 ? "text-bear" : "text-slate-100";
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`num text-base font-semibold ${cls}`}>
        {signed != null && signed > 0 ? "+" : ""}
        {value}
      </p>
    </div>
  );
}
