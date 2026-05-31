import { Card } from "@/components/ui/Card";
import { SignalPill } from "@/components/ui/SignalPill";
import { tradePlan as p } from "@/lib/mockData";
import { num } from "@/lib/format";

export function TradePlan() {
  const levels = [
    { label: "Target 2", value: p.target2, tone: "bull" as const },
    { label: "Target 1", value: p.target1, tone: "bull" as const },
    { label: "Entry", value: p.entry, tone: "accent" as const },
    { label: "Stop-Loss", value: p.stopLoss, tone: "bear" as const },
  ];
  const toneMap = {
    bull: "border-bull/30 bg-bull-soft text-bull",
    bear: "border-bear/30 bg-bear-soft text-bear",
    accent: "border-accent/30 bg-accent/10 text-accent",
  };

  return (
    <Card
      id="trade-plan"
      title="Entry & Exit Trade Plan"
      subtitle={`${p.symbol} · ${p.segment}`}
      action={<SignalPill signal={p.signal} label={p.action} />}
    >
      <div className="space-y-2">
        {levels.map((lvl) => (
          <div key={lvl.label} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${toneMap[lvl.tone]}`}>
            <span className="text-xs font-medium">{lvl.label}</span>
            <span className="num text-sm font-semibold">{num(lvl.value)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2 text-center">
          <p className="text-[11px] text-slate-500">Risk : Reward</p>
          <p className="num text-base font-semibold text-slate-100">1 : {p.riskReward.toFixed(1)}</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2 text-center">
          <p className="text-[11px] text-slate-500">Direction</p>
          <p className="text-base font-semibold text-slate-100">{p.action}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {p.notes.map((n, i) => (
          <li key={i} className="flex gap-2 text-xs text-slate-400">
            <span className="mt-0.5 text-accent">▸</span>
            {n}
          </li>
        ))}
      </ul>
    </Card>
  );
}
