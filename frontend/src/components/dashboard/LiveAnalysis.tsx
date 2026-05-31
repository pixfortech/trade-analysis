"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SignalPill } from "@/components/ui/SignalPill";
import { EmptyState, ErrorState, TradePlanSkeleton } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import type { TradePlanResponse } from "@/types/api";

// A few preset Indian-market instruments for the demo selector.
const INSTRUMENTS = [
  { symbol: "RELIANCE", segment: "Equity" },
  { symbol: "INFY", segment: "Equity" },
  { symbol: "NIFTY", segment: "Index Future" },
  { symbol: "BANKNIFTY", segment: "Index Option" },
  { symbol: "FINNIFTY", segment: "Index Option" },
];

/**
 * Demonstrates the full Phase 2 wiring:
 *   Frontend (typed API client) → Backend → AI engine (with mock fallback).
 * Shows empty / loading / error / success states.
 */
export function LiveAnalysis() {
  const [selected, setSelected] = useState("");
  const plan = useAsync(api.tradePlan);

  const onAnalyze = () => {
    const found = INSTRUMENTS.find((i) => i.symbol === selected);
    if (!found) return;
    void plan.run({ symbol: found.symbol, segment: found.segment });
  };

  return (
    <Card
      id="live-analysis"
      title="Live Analysis (API)"
      subtitle="Frontend → Backend → AI engine · demo data"
      action={plan.data ? <SignalPill signal={plan.data.signal} label={plan.data.action} /> : null}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 rounded-lg border border-white/5 bg-base-800/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
          aria-label="Select instrument"
        >
          <option value="">Select an instrument…</option>
          {INSTRUMENTS.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.symbol} · {i.segment}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!selected || plan.isLoading}
          className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {plan.isLoading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      <div className="mt-4">
        {plan.isIdle && (
          <EmptyState
            title="No instrument selected"
            message="Choose a symbol and click Analyze to request a demo trade plan from the backend."
          />
        )}
        {plan.isLoading && <TradePlanSkeleton />}
        {plan.isError && (
          <ErrorState
            message={plan.error ?? "Request failed."}
            hint="Start the backend (cd backend && npm run dev). In GitHub Codespaces, also forward port 4000 (Ports tab). The AI engine is optional — the backend serves mock data if it's offline."
            onRetry={onAnalyze}
          />
        )}
        {plan.isSuccess && plan.data && <PlanResult plan={plan.data} />}
      </div>
    </Card>
  );
}

function PlanResult({ plan }: { plan: TradePlanResponse }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-slate-100">{plan.symbol}</p>
          <p className="text-xs text-slate-500">
            {plan.segment} · confidence {plan.confidence}%
          </p>
        </div>
        <SourceBadge source={plan.source} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Level label="Entry" value={plan.entry} tone="accent" />
        <Level label="Stop-Loss" value={plan.stopLoss} tone="bear" />
        <Level label="Target" value={plan.target} tone="bull" />
        <Level label="R : R" value={plan.riskReward} tone="neutral" prefix="1 : " />
      </div>

      <ul className="mt-4 space-y-1.5">
        {plan.rationale.map((r, i) => (
          <li key={i} className="flex gap-2 text-xs text-slate-400">
            <span className="mt-0.5 text-accent">▸</span>
            {r}
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-md border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        ⚠️ {plan.disclaimer}
      </p>
    </div>
  );
}

function Level({
  label,
  value,
  tone,
  prefix = "",
}: {
  label: string;
  value: number | null;
  tone: "accent" | "bull" | "bear" | "neutral";
  prefix?: string;
}) {
  const toneMap = {
    accent: "border-accent/20 text-accent",
    bull: "border-bull/20 text-bull",
    bear: "border-bear/20 text-bear",
    neutral: "border-white/5 text-slate-200",
  } as const;
  return (
    <div className={`rounded-lg border bg-base-800/60 px-3 py-2 text-center ${toneMap[tone]}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="num text-sm font-semibold">{value === null ? "—" : `${prefix}${num(value)}`}</p>
    </div>
  );
}

function SourceBadge({ source }: { source: TradePlanResponse["source"] }) {
  const map = {
    "ai-engine": { text: "via AI engine", cls: "border-accent/30 bg-accent/10 text-accent" },
    mock: { text: "mock data", cls: "border-white/10 bg-base-800 text-slate-400" },
    "mock-fallback": {
      text: "mock fallback",
      cls: "border-neutralSignal/30 bg-neutralSignal-soft text-neutralSignal",
    },
  } as const;
  const m = map[source] ?? map.mock;
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${m.cls}`}>{m.text}</span>
  );
}
