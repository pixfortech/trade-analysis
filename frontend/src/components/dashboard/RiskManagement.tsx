import { Card } from "@/components/ui/Card";
import { riskMetrics as m } from "@/lib/mockData";
import { inr, num } from "@/lib/format";

export function RiskManagement() {
  return (
    <Card id="risk" title="Risk Management" subtitle="Position sizing · demo calc">
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Capital" value={inr(m.capital)} />
        <Tile label="Risk / Trade" value={`${m.riskPercent}%`} sub={inr(m.riskAmount)} />
        <Tile label="Risk / Unit" value={inr(m.perUnitRisk)} />
        <Tile label="Position Size" value={`${num(m.positionSize, 0)} qty`} />
      </div>

      <div className="mt-4 rounded-lg border border-white/5 bg-base-800/60 p-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-slate-400">Capital at risk</span>
          <span className="num text-slate-300">
            {inr(m.riskAmount)} / {inr(m.capital)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
          <div className="h-full rounded-full bg-neutralSignal" style={{ width: `${Math.min(m.riskPercent * 6, 100)}%` }} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Keeping per-trade risk small (≈{m.riskPercent}%) preserves capital across losing streaks. Always
          size positions from your stop-loss distance — never the other way around.
        </p>
      </div>
    </Card>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="num mt-1 text-base font-semibold text-slate-100">{value}</p>
      {sub && <p className="num text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
