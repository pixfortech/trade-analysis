"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/apiClient";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { num, compact } from "@/lib/format";
import { fmtMarketTime } from "@/lib/marketTime";
import type { Mover, MoverSort, TopMoversResponse } from "@/types/api";

const TABS: { id: TopMoversResponse["segment"]; label: string }[] = [
  { id: "indices", label: "Indices" },
  { id: "equity", label: "Equity" },
  { id: "futures", label: "Futures" },
  { id: "options", label: "Options" },
];
const SORTS: { id: MoverSort; label: string }[] = [
  { id: "percent", label: "% Change" },
  { id: "absolute", label: "Abs Change" },
  { id: "volume", label: "Volume" },
  { id: "oi", label: "OI" },
];

/** Top gainers/losers — LIVE Kite quotes, canonical labels, liquidity-filtered. */
export function TopPerformersCard() {
  const [tab, setTab] = useState<TopMoversResponse["segment"]>("indices");
  const [sort, setSort] = useState<MoverSort>("percent");
  const [data, setData] = useState<TopMoversResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const cfg = usePublicConfig();
  const tz = cfg.session.timezone;

  const load = useCallback(async (seg: TopMoversResponse["segment"], s: MoverSort) => {
    setStatus("loading");
    setError(null);
    try {
      setData(await api.topMovers(seg, s));
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(tab, sort); }, [tab, sort, load]);
  useKiteConnected(() => void load(tab, sort));

  const showOi = tab === "options" || tab === "futures";

  return (
    <Card id="top-performers" eyebrow="Market movers" title="Top Performers" subtitle="Live Kite scan · liquidity-filtered"
      action={
        <button type="button" onClick={() => void load(tab, sort)} className="rounded-lg border border-white/10 bg-base-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100">Refresh</button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-lg border border-white/5 bg-base-800/60 p-0.5">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${tab === t.id ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as MoverSort)} aria-label="Sort by"
          className="rounded-lg border border-white/10 bg-base-800/60 px-2 py-1.5 text-xs font-medium text-slate-300">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className="mt-3">
        {status === "loading" && !data && <p className="text-sm text-slate-500">Loading {tab}…</p>}
        {status === "error" && !data && (
          <p className="rounded-lg border border-bear/30 bg-bear-soft px-3 py-2 text-sm text-bear">Connect Kite to load live movers. {error ? <span className="text-bear/80">({error})</span> : null}</p>
        )}
        {data && (
          <>
            <p className="mb-2 text-[11px] text-slate-400">
              <span className="font-semibold text-neutralSignal">Live scan:</span> {data.total} checked · {data.passed} passed{data.filters.length ? ` (${data.filters.join(" · ")})` : ""} · refreshed {fmtMarketTime(Date.parse(data.timestamp), tz) ?? "—"}
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 items-start">
              <MoverList title="Gainers" movers={data.gainers} tone="bull" showOi={showOi} empty="No gainers passed the filters." />
              <MoverList title="Losers" movers={data.losers} tone="bear" showOi={showOi} empty="No losers passed the filters." />
            </div>
            {data.gainers.length === 0 && data.losers.length === 0 && (
              <p className="mt-2 rounded-lg border border-white/10 bg-base-800/40 px-3 py-2 text-center text-xs text-slate-400">No movers passed liquidity filters (market may be closed or the scan is flat).</p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function MoverList({ title, movers, tone, empty, showOi }: { title: string; movers: Mover[]; tone: "bull" | "bear"; empty: string; showOi: boolean }) {
  const head = tone === "bull" ? "text-bull" : "text-bear";
  const edge = tone === "bull" ? "border-bull/20" : "border-bear/20";
  return (
    <div className={`rounded-lg border ${edge} bg-base-800/40 p-2`}>
      <p className={`eyebrow mb-1.5 flex items-center justify-between gap-1.5 px-1 ${head}`}>
        <span className="flex items-center gap-1.5"><span aria-hidden>{tone === "bull" ? "▲" : "▼"}</span>{title}</span>
        <span className="num text-slate-500">{movers.length}</span>
      </p>
      {movers.length === 0 ? (
        <p className="px-1 py-3 text-[11px] leading-relaxed text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {movers.map((m) => (
            <li key={m.instrumentToken || m.instrument} className="flex items-center justify-between gap-2 px-1 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-slate-200" title={m.displayName}>{m.compactName}</span>
                {showOi && <span className="num block text-[10px] text-slate-500">Vol {compact(m.volume)}{m.oi != null ? ` · OI ${compact(m.oi)}` : ""}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {m.freshness !== "LIVE" && <span className="text-[9px] font-bold uppercase text-neutralSignal" title="Quote freshness">{m.freshness}</span>}
                <span className="num text-[13px] text-slate-300">{num(m.ltp)}</span>
                <span className={`num w-16 text-right text-[13px] font-bold ${m.changePercent >= 0 ? "text-bull" : "text-bear"}`}>{m.changePercent >= 0 ? "+" : ""}{m.changePercent}%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
