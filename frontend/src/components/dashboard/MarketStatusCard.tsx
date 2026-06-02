"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import type { MarketStatusResponse } from "@/types/api";

const STATUS_CLS: Record<MarketStatusResponse["status"], string> = {
  open: "border-bull/40 bg-bull-soft text-bull",
  "pre-open": "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  "post-close": "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  closed: "border-bear/40 bg-bear-soft text-bear",
  weekend: "border-bear/40 bg-bear-soft text-bear",
  "holiday-unknown": "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
};

/** Real NSE market status (IST). Refreshes every 30s. */
export function MarketStatusCard() {
  const status = useAsync(api.marketStatus);

  useEffect(() => {
    void status.run();
    const id = window.setInterval(() => void status.run(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = status.data;
  return (
    <Card id="market-status" title="Market Status" subtitle="NSE · Asia/Kolkata">
      {!d && <p className="text-sm text-slate-500">Checking market status…</p>}
      {d && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className={`rounded-full border px-3 py-1 text-sm font-bold uppercase ${STATUS_CLS[d.status]}`}>
              {d.status.replace("-", " ")}
            </span>
            <span className="num text-sm text-slate-400">{d.currentIstTime}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
              <p className="text-xs text-slate-500">Next open</p>
              <p className="num font-semibold text-slate-100">{d.nextOpenTime ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
              <p className="text-xs text-slate-500">Next close</p>
              <p className="num font-semibold text-slate-100">{d.nextCloseTime ?? "—"}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">{d.message}</p>
        </div>
      )}
    </Card>
  );
}
