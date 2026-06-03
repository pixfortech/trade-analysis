"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import { InfoTooltip } from "@/components/ui/Inputs";

interface TrackedTrade {
  id: string;
  instrumentKey: string;
  displayName: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  stopLoss: number | null;
  target: number | null;
  notes: string;
  createdAt: number;
}

// Separate storage key from the dashboard layout — resetting trades must not
// touch layout preferences.
const STORAGE_KEY = "manual.trades.v1";

/**
 * Manual Trade Tracker — READ-ONLY. Track positions you take elsewhere with
 * live prices for unrealised P/L. NEVER places, modifies or executes orders.
 * Persisted in localStorage; each trade has its own delete; reset-all confirms.
 */
export function PaperTradingPanel() {
  const { value: trades, setValue: setTrades } = useLocalStorage<TrackedTrade[]>(STORAGE_KEY, []);
  const [sel, setSel] = useState<{ key: string; label: string; lot: number | null } | null>(null);
  const [entry, setEntry] = useState("");
  const [qty, setQty] = useState("");
  const [sl, setSl] = useState("");
  const [target, setTarget] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});

  const onSelect = (ins: SelectedInstrument) => {
    setSel({ key: ins.instrument, label: ins.displayName, lot: ins.lotSize });
    if (ins.lotSize) setQty(String(ins.lotSize));
  };

  // Live prices for tracked instruments (batch quote, 5s).
  const refreshPrices = useCallback(async () => {
    const keys = Array.from(new Set(trades.map((t) => t.instrumentKey)));
    if (keys.length === 0) return;
    try {
      const res = await api.kite.quotes(keys);
      const next: Record<string, number> = {};
      for (const [k, q] of Object.entries(res.data)) {
        if (typeof q.last_price === "number") next[k] = q.last_price;
      }
      setPrices(next);
    } catch {
      /* live prices unavailable — show entry-based view */
    }
  }, [trades]);

  useEffect(() => {
    void refreshPrices();
    const id = window.setInterval(() => void refreshPrices(), 5000);
    return () => window.clearInterval(id);
  }, [refreshPrices]);

  const add = (direction: "LONG" | "SHORT") => {
    setErr(null);
    if (!sel) return setErr("Select an instrument first.");
    const entryPrice = Number(entry);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return setErr("Enter a valid entry price.");
    const quantity = Number(qty) || sel.lot || 1;
    const trade: TrackedTrade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      instrumentKey: sel.key,
      displayName: sel.label,
      direction,
      entryPrice,
      quantity,
      stopLoss: sl.trim() ? Number(sl) : null,
      target: target.trim() ? Number(target) : null,
      notes: "",
      createdAt: Date.now(),
    };
    setTrades((cur) => [trade, ...cur]);
    setEntry("");
    setSl("");
    setTarget("");
    void refreshPrices();
  };

  const remove = (id: string) => setTrades((cur) => cur.filter((t) => t.id !== id));
  const resetAll = () => {
    if (!window.confirm("Remove ALL tracked trades? This clears only this tracker (not your dashboard layout).")) return;
    setTrades([]);
  };

  const pnlOf = (t: TrackedTrade): number | null => {
    const cur = prices[t.instrumentKey];
    if (cur == null) return null;
    return Math.round((t.direction === "LONG" ? cur - t.entryPrice : t.entryPrice - cur) * t.quantity * 100) / 100;
  };
  const totalPnl = trades.reduce((a, t) => a + (pnlOf(t) ?? 0), 0);

  return (
    <Card
      id="manual-trade-tracker"
      title="Manual Trade Tracker"
      subtitle="Track your positions with live prices — no real orders are placed or executed"
      action={
        <InfoTooltip label="What is this?">
          A personal tracker for positions you take elsewhere. Enter side, entry, quantity, optional SL/target; it
          shows the <strong>live price</strong> and your unrealised P/L. <strong>It never places, modifies or
          executes any order.</strong> Saved in this browser only.
        </InfoTooltip>
      }
    >
      <p className="mb-3 rounded-md border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
        Manual position tracking only. No real orders are placed or executed. Prices are live (read-only) from
        Zerodha Kite; P/L is an estimate.
      </p>

      <InstrumentSearch onSelect={onSelect} placeholder="Instrument to track… (e.g. RELIANCE, NIFTY FUT)" />

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Entry price" value={entry} onChange={setEntry} placeholder="e.g. 1450" />
        <Field label="Quantity" value={qty} onChange={setQty} placeholder={sel?.lot ? `lot ${sel.lot}` : "qty"} />
        <Field label="Stop-loss (opt)" value={sl} onChange={setSl} placeholder="optional" />
        <Field label="Target (opt)" value={target} onChange={setTarget} placeholder="optional" />
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button
            type="button"
            onClick={() => add("LONG")}
            disabled={!sel}
            className="flex-1 rounded-lg border border-bull/40 bg-bull-soft px-3 py-2 text-sm font-semibold text-bull hover:bg-bull/20 disabled:opacity-40"
          >
            + Long
          </button>
          <button
            type="button"
            onClick={() => add("SHORT")}
            disabled={!sel}
            className="flex-1 rounded-lg border border-bear/40 bg-bear-soft px-3 py-2 text-sm font-semibold text-bear hover:bg-bear/20 disabled:opacity-40"
          >
            + Short
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-bear">{err}</p>}

      {trades.length > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-slate-300">
            Total unrealised:{" "}
            <span className={`num font-semibold ${totalPnl > 0 ? "text-bull" : totalPnl < 0 ? "text-bear" : "text-slate-200"}`}>
              {totalPnl > 0 ? "+" : ""}
              {num(totalPnl)}
            </span>
          </p>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-bear"
          >
            Reset all
          </button>
        </div>
      )}

      <div className="mt-3">
        {trades.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No tracked trades. Add one above (Long/Short).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-medium">Instrument</th>
                  <th className="px-2 py-2 font-medium">Side</th>
                  <th className="px-2 py-2 text-right font-medium">Entry</th>
                  <th className="px-2 py-2 text-right font-medium">LTP</th>
                  <th className="px-2 py-2 text-right font-medium">P/L</th>
                  <th className="px-2 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {trades.map((t) => {
                  const cur = prices[t.instrumentKey] ?? null;
                  const pnl = pnlOf(t);
                  const cls = pnl == null ? "text-slate-500" : pnl > 0 ? "text-bull" : pnl < 0 ? "text-bear" : "text-slate-300";
                  return (
                    <tr key={t.id} className="hover:bg-white/5">
                      <td className="px-2 py-2.5">
                        <p className="font-medium text-slate-100">{t.displayName}</p>
                        <p className="num text-[11px] text-slate-500">
                          qty {t.quantity}
                          {t.stopLoss ? ` · SL ${num(t.stopLoss)}` : ""}
                          {t.target ? ` · T ${num(t.target)}` : ""}
                        </p>
                      </td>
                      <td className={`px-2 py-2.5 text-xs font-semibold ${t.direction === "LONG" ? "text-bull" : "text-bear"}`}>{t.direction}</td>
                      <td className="num px-2 py-2.5 text-right text-slate-200">{num(t.entryPrice)}</td>
                      <td className="num px-2 py-2.5 text-right text-slate-200">{cur != null ? num(cur) : "—"}</td>
                      <td className={`num px-2 py-2.5 text-right font-semibold ${cls}`}>
                        {pnl == null ? "—" : `${pnl > 0 ? "+" : ""}${num(pnl)}`}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => remove(t.id)}
                          aria-label={`Delete ${t.displayName}`}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-400 transition-colors hover:border-bear/40 hover:text-bear"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="w-full rounded-lg border border-white/10 bg-base-800/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
      />
    </label>
  );
}
