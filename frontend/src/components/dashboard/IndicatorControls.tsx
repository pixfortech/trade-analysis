"use client";

import type { IndicatorContribution, IndicatorId } from "@/types/api";

export const ALL_INDICATORS: IndicatorId[] = [
  "VWAP",
  "EMA20",
  "EMA50",
  "RSI",
  "MACD",
  "ADX",
  "ATR",
  "SUPERTREND",
  "VOLUME",
  "OI",
];

const DIR_CLS: Record<string, string> = {
  bullish: "text-bull",
  bearish: "text-bear",
  neutral: "text-slate-400",
  unavailable: "text-slate-600",
};

/**
 * Indicator toggles + live contribution table. Toggling recalculates the signal
 * (the parent re-fetches with the new active set). Read-only.
 */
export function IndicatorControls({
  active,
  onToggle,
  contributions,
}: {
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
  contributions?: IndicatorContribution[];
}) {
  const contribById = new Map((contributions ?? []).map((c) => [c.id, c]));

  return (
    <div className="rounded-lg border border-white/5 bg-base-800/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">Indicators ({active.length} active)</p>
        <span className="text-[11px] text-slate-500">toggle to recalculate</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_INDICATORS.map((id) => {
          const on = active.includes(id);
          const c = contribById.get(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 bg-base-900/50 text-slate-500 hover:text-slate-300"
              }`}
              title={c ? `${c.direction}: ${c.detail}` : id}
            >
              {id}
              {on && c && c.direction !== "neutral" && c.direction !== "unavailable" && (
                <span className={`ml-1 ${DIR_CLS[c.direction]}`}>{c.direction === "bullish" ? "▲" : "▼"}</span>
              )}
            </button>
          );
        })}
      </div>

      {contributions && contributions.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2 font-medium">Indicator</th>
                <th className="py-1 pr-2 font-medium">Reading</th>
                <th className="py-1 pr-2 font-medium">Direction</th>
                <th className="py-1 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {contributions.map((c) => (
                <tr key={c.id}>
                  <td className="py-1 pr-2 font-medium text-slate-200">{c.id}</td>
                  <td className="num py-1 pr-2 text-slate-400">{c.value}</td>
                  <td className={`py-1 pr-2 capitalize ${DIR_CLS[c.direction]}`}>{c.direction}</td>
                  <td className="num py-1 text-right text-slate-400">{c.weight || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
