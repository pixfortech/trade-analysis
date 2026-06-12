"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { inr } from "@/lib/format";

/**
 * Zerodha Account Summary — READ-ONLY (Phase 3G). Shows funds/holdings/positions
 * when Kite permits; otherwise a clear "unavailable" message (never fake data).
 */
export function AccountSummaryCard() {
  const summary = useAsync(api.account.portfolioSummary);

  useEffect(() => {
    void summary.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = summary.data;
  const available = d?.source === "zerodha";

  return (
    <Card
      id="account-summary"
      eyebrow="Portfolio"
      title="Zerodha Account"
      subtitle="Read-only funds, holdings & positions"
      accent={available ? "bull" : undefined}
      action={
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            available ? "border-bull/30 bg-bull-soft text-bull" : "border-white/10 bg-base-800 text-slate-400"
          }`}
        >
          {available ? "ZERODHA LIVE" : "UNAVAILABLE"}
        </span>
      }
    >
      {!d && <p className="text-sm text-slate-500">Loading account…</p>}

      {d && available && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Available capital" value={inr(d.availableCapital)} big />
            <Tile label="Available cash" value={inr(d.availableCash)} big />
            <Tile label="Margin available" value={inr(d.marginAvailable)} />
            <Tile label="Margin used" value={inr(d.marginUsed)} />
            <Tile label="Holdings value" value={inr(d.holdingsValue)} />
            <Tile label="Positions P/L" value={inr(d.positionsPnl)} signed={d.positionsPnl} />
          </div>
          <p className="text-[11px] text-slate-500">Source: Zerodha live account (read-only).</p>
        </div>
      )}

      {d && !available && (
        <div className="rounded-lg border border-white/10 bg-base-800/50 px-4 py-5 text-center">
          <p className="text-sm font-medium text-slate-300">Account data not available</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{d.message}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            Connect &amp; authorise Kite (Status card). Some accounts/apps don&apos;t expose funds via the API —
            in that case, enter capital manually in Risk Management.
          </p>
        </div>
      )}
    </Card>
  );
}

function Tile({ label, value, big, signed }: { label: string; value: string; big?: boolean; signed?: number }) {
  const cls = signed == null ? "text-slate-100" : signed > 0 ? "text-bull" : signed < 0 ? "text-bear" : "text-slate-100";
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
      <p className="eyebrow text-slate-500">{label}</p>
      <p className={`num mt-0.5 font-bold tracking-tight ${big ? "text-xl" : "text-base"} ${cls}`}>{value}</p>
    </div>
  );
}
