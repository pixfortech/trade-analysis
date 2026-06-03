"use client";

import { InfoTooltip } from "@/components/ui/Inputs";
import { buildTimeBasedPlan } from "@/lib/timeBasedPlan";
import type { LiveSignal } from "@/types/api";

/**
 * Time-Based Exit Plan — holding-period guidance (5m / 10-15m / 30m+ / close)
 * derived from the REAL live-signal levels (VWAP, EMA, S/R, ATR, Supertrend).
 * Advisory only — describes conditions to exit on, not guaranteed timing.
 */
export function TimeBasedPlan({ signal }: { signal: LiveSignal }) {
  const { side, rows, bestStyle, recommendedAction } = buildTimeBasedPlan(signal);

  return (
    <div className="mt-5">
      {/* Summary: best holding style + recommended action */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
          <p className="text-[11px] text-slate-500">Best holding style now</p>
          <p className="text-sm font-semibold capitalize text-slate-100">{bestStyle}</p>
        </div>
        <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
          <p className="text-[11px] text-slate-500">Recommended action</p>
          <p className="text-sm font-semibold text-accent">{recommendedAction}</p>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Time-Based Hold / Exit Plan</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            side === "LONG"
              ? "border-bull/30 bg-bull-soft text-bull"
              : side === "SHORT"
                ? "border-bear/30 bg-bear-soft text-bear"
                : "border-neutralSignal/30 bg-neutralSignal-soft text-neutralSignal"
          }`}
        >
          {side}
        </span>
        <InfoTooltip label="?">
          How to manage the trade by holding period, using live levels (VWAP, EMA, support/resistance, ATR,
          Supertrend). These are <strong>conditions to act on</strong> (e.g. “exit if price reclaims VWAP”), not
          promises about exact timing. Advisory only.
        </InfoTooltip>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 font-medium">Holding period</th>
              <th className="px-2 py-1.5 font-medium">Plan</th>
              <th className="px-2 py-1.5 font-medium">Exit when…</th>
              <th className="px-2 py-1.5 font-medium">Trail stop</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.period} className="align-top">
                <td className="px-2 py-2 font-semibold text-slate-200">{r.period}</td>
                <td className="px-2 py-2 text-slate-300">{r.plan}</td>
                <td className="px-2 py-2 text-slate-300">{r.exitCondition}</td>
                <td className="px-2 py-2 text-slate-400">
                  {r.trailStop}
                  {r.riskNote && <span className="mt-1 block text-[11px] text-neutralSignal">{r.riskNote}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        ⚠️ Advisory only — no automatic execution. Exit on the stated condition, not on a fixed clock, unless your
        own plan is strictly time-based.
      </p>
    </div>
  );
}
