"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import type { Mover, TopMoversResponse } from "@/types/api";

const TABS: { id: TopMoversResponse["segment"]; label: string }[] = [
  { id: "indices", label: "Indices" },
  { id: "equity", label: "Equity" },
  { id: "futures", label: "Futures" },
  { id: "options", label: "Options" },
];

/** Top gainers/losers per segment. Read-only, rate-limit aware. */
export function TopPerformersCard() {
  const [tab, setTab] = useState<TopMoversResponse["segment"]>("indices");
  const [data, setData] = useState<TopMoversResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (seg: TopMoversResponse["segment"]) => {
    setStatus("loading");
    setError(null);
    try {
      const res = await api.topMovers(seg);
      setData(res);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  return (
    <Card
      id="top-performers"
      title="Top Performers"
      subtitle="Gainers & losers · live (bounded scan)"
      action={
        <button
          type="button"
          onClick={() => void load(tab)}
          className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100"
        >
          Refresh
        </button>
      }
    >
      <div className="flex gap-1 rounded-lg border border-white/5 bg-base-800/60 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {status === "loading" && <p className="text-sm text-slate-500">Loading {tab}…</p>}
        {status === "error" && (
          <p className="text-sm text-bear">
            {error} — needs Kite enabled & authorised.
          </p>
        )}
        {data && status !== "loading" && (
          <>
            {data.partialData && data.message && <p className="mb-2 text-[11px] text-neutralSignal">{data.message}</p>}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <MoverList title="Gainers" movers={data.gainers} tone="bull" />
              <MoverList title="Losers" movers={data.losers} tone="bear" />
            </div>
            {data.gainers.length === 0 && data.losers.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">No movers available (market may be closed or data is limited).</p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function MoverList({ title, movers, tone }: { title: string; movers: Mover[]; tone: "bull" | "bear" }) {
  const head = tone === "bull" ? "text-bull" : "text-bear";
  const edge = tone === "bull" ? "border-bull/20" : "border-bear/20";
  return (
    <div className={`rounded-lg border ${edge} bg-base-800/40 p-2`}>
      <p className={`eyebrow mb-1.5 flex items-center gap-1.5 px-1 ${head}`}>
        <span aria-hidden>{tone === "bull" ? "▲" : "▼"}</span>
        {title}
      </p>
      {movers.length === 0 ? (
        <p className="px-1 py-2 text-xs text-slate-500">—</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {movers.map((m) => (
            <li key={m.instrument} className="flex items-center justify-between px-1 py-1.5 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-200">{m.displayName}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="num text-slate-300">{num(m.ltp)}</span>
                <span className={`num w-16 text-right font-bold ${m.changePercent >= 0 ? "text-bull" : "text-bear"}`}>
                  {m.changePercent >= 0 ? "+" : ""}
                  {m.changePercent}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
