import { Card } from "@/components/ui/Card";
import { SignalPill } from "@/components/ui/SignalPill";
import { optionsSummary as o } from "@/lib/mockData";
import { compact, num } from "@/lib/format";

export function OptionsAnalysis() {
  const maxOI = Math.max(...o.chain.flatMap((s) => [s.callOI, s.putOI]));

  return (
    <Card
      id="options"
      title="Options Analysis"
      subtitle={`${o.symbol} · ${o.expiry} · OI snapshot`}
      action={<SignalPill signal={o.signal} />}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Spot" value={num(o.spot, 0)} />
        <Metric label="PCR" value={o.pcr.toFixed(2)} />
        <Metric label="Max Pain" value={num(o.maxPain, 0)} />
        <Metric label="Bias" value={o.signal} className="capitalize" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-bull/20 bg-bull-soft px-3 py-2">
          <p className="text-slate-400">Support</p>
          <p className="num font-semibold text-bull">{o.support.map((s) => num(s, 0)).join(" · ")}</p>
        </div>
        <div className="rounded-lg border border-bear/20 bg-bear-soft px-3 py-2">
          <p className="text-slate-400">Resistance</p>
          <p className="num font-semibold text-bear">{o.resistance.map((s) => num(s, 0)).join(" · ")}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
          <span>Call OI</span>
          <span>Strike</span>
          <span>Put OI</span>
        </div>
        <div className="space-y-1.5">
          {o.chain.map((s) => (
            <div key={s.strike} className="flex items-center gap-2 text-xs">
              <div className="flex flex-1 justify-end">
                <div className="h-4 rounded-l bg-bear/40" style={{ width: `${(s.callOI / maxOI) * 100}%` }} />
              </div>
              <span className={`num w-14 text-center ${s.isATM ? "font-bold text-accent" : "text-slate-300"}`}>
                {num(s.strike, 0)}
              </span>
              <div className="flex flex-1">
                <div className="h-4 rounded-r bg-bull/40" style={{ width: `${(s.putOI / maxOI) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-600">
          <span>OI in contracts (mock, max ≈ {compact(maxOI)})</span>
          <span>ATM highlighted</span>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`num text-sm font-semibold text-slate-100 ${className}`}>{value}</p>
    </div>
  );
}
