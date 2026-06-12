"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertToasts } from "./AlertToasts";
import { InstrumentSearch, type SelectedInstrument } from "./InstrumentSearch";
import type { ActiveTradeMonitor, MonitorAction } from "@/types/api";

const ACTION_CLS: Record<MonitorAction, string> = {
  HOLD: "border-bull/30 bg-bull-soft text-bull",
  PARTIAL_EXIT: "border-bull/30 bg-bull-soft text-bull",
  TIGHTEN_SL: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  WAIT_FOR_REENTRY: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  EXIT_NOW: "border-bear/50 bg-bear-soft text-bear",
  REVERSE_SETUP: "border-bear/50 bg-bear-soft text-bear",
};

/**
 * Active Trade Monitor — READ-ONLY. Enter a manual position (direction, entry,
 * qty) and the monitor evaluates it against the live signal: current P/L,
 * trailing SL, best exit for least loss, re-entry plan and a recommended
 * action. Optional live polling raises a popup on trend reversal. No execution.
 */
export function ActiveTradeMonitorCard() {
  const [instrument, setInstrument] = useState<{ key: string; label: string; lot: number | null } | null>(null);
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [livePolling, setLivePolling] = useState(false);
  const monitor = useAsync(api.activeTradeMonitor);
  const alerts = useAlerts();
  const prevAction = useRef<string | null>(null);

  const onSelect = (ins: SelectedInstrument) => {
    setInstrument({ key: ins.instrument, label: ins.displayName, lot: ins.lotSize });
    if (ins.lotSize) setQuantity(String(ins.lotSize));
  };

  const run = useCallback(async () => {
    if (!instrument || !entryPrice) return;
    const res = await monitor.run({
      instrument: instrument.key,
      positionDirection: direction,
      entryPrice: Number(entryPrice),
      quantity: Number(quantity) || instrument.lot || 1,
    });
    if (res) {
      if (res.trendChangeDetected && (res.recommendedAction === "EXIT_NOW" || res.recommendedAction === "TIGHTEN_SL")) {
        const sev = res.alertSeverity === "urgent" ? "urgent" : "caution";
        if (prevAction.current !== res.recommendedAction) {
          alerts.push(
            `monitor-${instrument.key}`,
            res.recommendedAction === "EXIT_NOW" ? "Exit suggested" : "Tighten stop",
            res.reason,
            sev,
          );
        }
      }
      prevAction.current = res.recommendedAction;
    }
  }, [instrument, entryPrice, quantity, direction, monitor, alerts]);

  useEffect(() => {
    if (!livePolling || !instrument || !entryPrice) return;
    const id = window.setInterval(() => void run(), 5000);
    return () => window.clearInterval(id);
  }, [livePolling, instrument, entryPrice, run]);

  return (
    <Card
      id="active-trade-monitor"
      eyebrow="Position monitor"
      title="Active Trade Monitor"
      subtitle="Track a manual position · READ-ONLY advisory"
      action={
        <span className="rounded-full border border-neutralSignal/30 bg-neutralSignal-soft px-3 py-1 text-xs font-semibold text-neutralSignal">
          ADVISORY · NO EXECUTION
        </span>
      }
    >
      <InstrumentSearch onSelect={onSelect} placeholder="Position instrument… (e.g. MIDCPNIFTY FUT)" />

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "LONG" | "SHORT")}
          aria-label="Direction"
          className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2.5 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        >
          <option value="LONG">LONG</option>
          <option value="SHORT">SHORT</option>
        </select>
        <input
          value={entryPrice}
          onChange={(e) => setEntryPrice(e.target.value)}
          placeholder="entry e.g. 14418"
          inputMode="decimal"
          aria-label="Entry price"
          className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2.5 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        />
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={instrument?.lot ? `qty (lot ${instrument.lot})` : "quantity"}
          inputMode="numeric"
          aria-label="Quantity"
          className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-2.5 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={monitor.isLoading || !instrument || !entryPrice}
          className="rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {monitor.isLoading ? "Checking…" : "Monitor"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLivePolling((v) => !v)}
          disabled={!instrument || !entryPrice}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
            livePolling ? "border-bull/40 bg-bull-soft text-bull" : "border-white/10 bg-base-800/60 text-slate-300 hover:text-slate-100"
          }`}
        >
          {livePolling ? "● Live (5s) — stop" : "Start live monitoring"}
        </button>
        {!alerts.browserEnabled && (
          <button
            type="button"
            onClick={() => void alerts.requestBrowser()}
            className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100"
          >
            Enable browser alerts
          </button>
        )}
      </div>

      <div className="mt-4">
        {monitor.isError && <ErrorState message={monitor.error ?? "Monitor failed."} hint="Needs live Kite data and a valid instrument/entry." onRetry={() => void run()} />}
        {monitor.isSuccess && monitor.data && <MonitorView m={monitor.data} />}
        {monitor.isIdle && <p className="text-sm text-slate-500">Select your position instrument, enter direction/entry/qty, then Monitor.</p>}
      </div>

      <AlertToasts toasts={alerts.toasts} onDismiss={alerts.dismiss} />
    </Card>
  );
}

function MonitorView({ m }: { m: ActiveTradeMonitor }) {
  const pnlUp = m.currentPnL >= 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">
            {m.positionDirection} · entry {num(m.entryPrice)} · qty {m.quantity}
          </p>
          <p className="num text-3xl font-bold leading-none tracking-tight text-slate-100">{num(m.currentPrice)}</p>
        </div>
        <div className="text-right">
          <p className="eyebrow text-slate-500">Current P/L</p>
          <p className={`num text-3xl font-bold leading-none tracking-tight ${pnlUp ? "text-bull" : "text-bear"}`}>
            {pnlUp ? "+" : ""}
            {num(m.currentPnL)}
          </p>
        </div>
      </div>

      <div className={`relative overflow-hidden rounded-xl border px-4 py-3 ${ACTION_CLS[m.recommendedAction]}`}>
        <p className="text-lg font-extrabold uppercase tracking-tight">{m.recommendedAction.replace(/_/g, " ")}</p>
        <p className="mt-1 text-sm text-slate-300">{m.reason}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Trend now" value={m.currentTrend} cap />
        <Tile label="Best exit (least loss)" value={num(m.bestExitForLeastLoss)} />
        <Tile label="Trailing SL" value={num(m.updatedStopLoss)} />
        <Tile label="Reversal?" value={m.trendChangeDetected ? "Yes" : "No"} />
      </div>

      {m.newEntryPlan.direction !== "none" && (
        <div className="rounded-lg border border-white/5 bg-base-800/40 px-4 py-3 text-sm">
          <p className="font-semibold text-slate-100">Re-entry plan ({m.newEntryPlan.direction})</p>
          <p className="num mt-1 text-slate-300">
            entry {m.newEntryPlan.entryLevel != null ? num(m.newEntryPlan.entryLevel) : "—"} · SL{" "}
            {m.newEntryPlan.stopLoss != null ? num(m.newEntryPlan.stopLoss) : "—"} · T1{" "}
            {m.newEntryPlan.target1 != null ? num(m.newEntryPlan.target1) : "—"} · T2{" "}
            {m.newEntryPlan.target2 != null ? num(m.newEntryPlan.target2) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">{m.newEntryPlan.note}</p>
        </div>
      )}

      <p className="rounded-lg border border-neutralSignal/20 bg-neutralSignal-soft px-4 py-3 text-xs leading-relaxed text-neutralSignal">
        ⚠️ {m.disclaimer}
      </p>
    </div>
  );
}

function Tile({ label, value, cap }: { label: string; value: string; cap?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
      <p className="eyebrow text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-bold text-slate-100 ${cap ? "capitalize" : "num"}`}>{value}</p>
    </div>
  );
}
