"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useAsync } from "@/hooks/useAsync";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { api } from "@/lib/apiClient";
import { inr, num } from "@/lib/format";

const RISK_PCTS = [0.25, 0.5, 1, 1.5, 2];

interface RiskSettings {
  capitalOverride: number | null;
  riskPercent: number;
  stopDistance: number; // points from entry to SL (per unit)
  lotSize: number;
}

const DEFAULTS: RiskSettings = { capitalOverride: null, riskPercent: 1, stopDistance: 20, lotSize: 1 };

/**
 * Risk Management — Phase 3G. Uses live Zerodha capital when available, else a
 * user-entered override. Computes risk per trade, per-unit/per-lot risk, max
 * lots and capital at risk. Settings persist in localStorage. No real orders.
 */
export function RiskManagementCard() {
  const { value: settings, setValue } = useLocalStorage<RiskSettings>("risk.settings.v1", DEFAULTS);
  const account = useAsync(api.account.portfolioSummary);
  const [override, setOverride] = useState("");

  useEffect(() => {
    void account.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveCapital = account.data?.source === "zerodha" ? account.data.availableCapital : null;
  const capital = settings.capitalOverride ?? liveCapital ?? 100000;
  const capitalSource = settings.capitalOverride != null ? "user-override" : liveCapital != null ? "zerodha" : "fallback";

  const riskAmount = (capital * settings.riskPercent) / 100;
  const perUnitRisk = settings.stopDistance > 0 ? settings.stopDistance : 1;
  const perLotRisk = perUnitRisk * settings.lotSize;
  const maxUnits = Math.floor(riskAmount / perUnitRisk);
  const maxLots = settings.lotSize > 0 ? Math.floor(riskAmount / perLotRisk) : 0;

  const set = (patch: Partial<RiskSettings>) => setValue((c) => ({ ...c, ...patch }));

  return (
    <Card
      id="risk-management"
      title="Risk Management"
      subtitle="Position sizing from your capital & risk %"
      action={
        <span className="rounded-full border border-white/10 bg-base-800 px-3 py-1 text-xs font-medium text-slate-400">
          {capitalSource === "zerodha" ? "ZERODHA CAPITAL" : capitalSource === "user-override" ? "MANUAL CAPITAL" : "FALLBACK"}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Capital" value={inr(capital)} big />
        <Tile label="Risk / trade" value={inr(riskAmount)} sub={`${settings.riskPercent}%`} />
        <Tile label="Risk / unit" value={num(perUnitRisk)} />
        <Tile label="Max position (paper)" value={`${maxUnits} qty · ${maxLots} lot`} />
      </div>

      {/* Controls */}
      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1 text-xs text-slate-500">Risk percentage</p>
          <div className="flex flex-wrap gap-1.5">
            {RISK_PCTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ riskPercent: p })}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  settings.riskPercent === p ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 bg-base-800/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Capital override (₹)" placeholder={liveCapital != null ? "use Zerodha" : "e.g. 100000"} value={override} onChange={setOverride} onBlur={() => set({ capitalOverride: override.trim() ? Number(override) : null })} />
          <Field label="Stop distance (pts)" value={String(settings.stopDistance)} onChange={(v) => set({ stopDistance: Number(v) || 0 })} />
          <Field label="Lot size" value={String(settings.lotSize)} onChange={(v) => set({ lotSize: Number(v) || 1 })} />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-white/5 bg-base-800/60 p-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-400">Capital at risk</span>
          <span className="num text-slate-300">{inr(riskAmount)} / {inr(capital)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
          <div className="h-full rounded-full bg-neutralSignal" style={{ width: `${Math.min(settings.riskPercent * 6, 100)}%` }} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Position sizes are advisory, for decision support only. Capital source: <span className="text-slate-400">{capitalSource}</span>.
          {capitalSource === "fallback" ? " Enter capital manually or connect Zerodha." : ""}
        </p>
      </div>
    </Card>
  );
}

function Tile({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`num font-semibold text-slate-100 ${big ? "text-lg" : "text-[15px]"}`}>{value}</p>
      {sub && <p className="num text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputMode="decimal"
        className="w-full rounded-lg border border-white/10 bg-base-800/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
      />
    </label>
  );
}
