"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/Inputs";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import type { Mover, TopMoversResponse } from "@/types/api";

const TABS: { id: TopMoversResponse["segment"]; label: string }[] = [
  { id: "indices", label: "Indices" },
  { id: "equity", label: "Equity" },
  { id: "futures", label: "Futures" },
  { id: "options", label: "Options" },
];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Top gainers/losers from a bounded (rate-limit-aware) LIVE Kite scan. */
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
      eyebrow="Market movers"
      title="Top Performers"
      subtitle="Gainers & losers · live bounded scan"
      action={
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bull/30 bg-bull-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-bull">
            <span className="h-1.5 w-1.5 rounded-full bg-bull" /> Live limited scan
          </span>
          <button
            type="button"
            onClick={() => void load(tab)}
            className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100"
          >
            Refresh
          </button>
        </span>
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
          <p className="rounded-lg border border-bear/30 bg-bear-soft px-3 py-2 text-sm text-bear">
            Movers unavailable — refresh or reconnect Kite. {error ? <span className="text-bear/80">({error})</span> : null}
          </p>
        )}
        {data && status !== "loading" && (
          <>
            {/* scan scope + last refreshed + explainer */}
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] text-slate-400">
                <span className="font-semibold text-neutralSignal">Limited scan:</span> {data.scanned} of {data.total} scanned · refreshed {fmtTime(data.timestamp)}
              </p>
              <InfoTooltip label="Why limited?">
                Movers come from a <strong>bounded scan list</strong> ({data.scanned}/{data.total} instruments), not the full NSE universe — this respects Zerodha Kite&apos;s rate limits. The data <strong>is live</strong> (Kite quotes); only the scanned set is capped. Full-universe scanning would need a larger backend scan/index service.
              </InfoTooltip>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <MoverList title="Gainers" movers={data.gainers} tone="bull" empty="No positive movers in current limited scan." />
              <MoverList title="Losers" movers={data.losers} tone="bear" empty="No negative movers in current limited scan." />
            </div>

            {data.gainers.length === 0 && data.losers.length === 0 && (
              <p className="mt-2 rounded-lg border border-white/10 bg-base-800/40 px-3 py-2 text-center text-xs text-slate-400">
                No movers in this scan right now (market may be closed, or the scanned set is flat). Try Refresh or another segment.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function MoverList({ title, movers, tone, empty }: { title: string; movers: Mover[]; tone: "bull" | "bear"; empty: string }) {
  const head = tone === "bull" ? "text-bull" : "text-bear";
  const edge = tone === "bull" ? "border-bull/20" : "border-bear/20";
  return (
    <div className={`rounded-lg border ${edge} bg-base-800/40 p-2`}>
      <p className={`eyebrow mb-1.5 flex items-center justify-between gap-1.5 px-1 ${head}`}>
        <span className="flex items-center gap-1.5">
          <span aria-hidden>{tone === "bull" ? "▲" : "▼"}</span>
          {title}
        </span>
        <span className="num text-slate-500">{movers.length}</span>
      </p>
      {movers.length === 0 ? (
        <p className="px-1 py-3 text-[11px] leading-relaxed text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {movers.map((m) => (
            <li key={m.instrument} className="flex items-center justify-between gap-2 px-1 py-1.5 text-sm">
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
