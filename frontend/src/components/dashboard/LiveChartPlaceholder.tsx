"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { chartSeries, marketIndices } from "@/lib/mockData";
import { num, pct } from "@/lib/format";

const TIMEFRAMES = ["1D", "1W", "1M"] as const;

export function LiveChartPlaceholder() {
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>("1D");
  const nifty = marketIndices[0];
  const data = chartSeries[tf];

  // Build an SVG area path from the mock series.
  const W = 600;
  const H = 220;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 24) - 12;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <Card
      id="chart"
      title="Live Chart"
      subtitle={`${nifty.name} · placeholder`}
      action={
        <div className="flex gap-1 rounded-lg border border-white/5 bg-base-800/60 p-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tf === t ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-3 flex items-baseline gap-3">
        <span className="num text-2xl font-semibold text-slate-100">{num(nifty.ltp)}</span>
        <span className="num text-sm text-bull">{pct(nifty.changePercent)}</span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full sm:h-56" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1="0" y1={H * g} x2={W} y2={H * g} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#chartFill)" />
          <path d={line} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rounded-full border border-white/10 bg-base-900/70 px-3 py-1 text-[11px] text-slate-400 backdrop-blur">
            📈 Real-time chart integration coming in a later phase
          </span>
        </div>
      </div>
    </Card>
  );
}
