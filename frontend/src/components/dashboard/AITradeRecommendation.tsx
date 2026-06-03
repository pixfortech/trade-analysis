import { Card } from "@/components/ui/Card";
import { SignalPill } from "@/components/ui/SignalPill";
import { aiRecommendation as r } from "@/lib/mockData";
import { num } from "@/lib/format";

export function AITradeRecommendation() {
  const actionClass =
    r.action === "BUY" ? "text-bull" : r.action === "SELL" ? "text-bear" : "text-neutralSignal";

  return (
    <Card
      id="ai-reco"
      title="AI Trade Recommendation"
      subtitle="Model output · sample data (not live)"
      action={<SignalPill signal={r.signal} />}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-slate-100">{r.symbol}</p>
          <p className="text-xs text-slate-500">{r.segment}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${actionClass}`}>{r.action}</p>
          <p className="text-[11px] text-slate-500">Suggested action</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-400">Confidence</span>
          <span className="num text-slate-300">{r.confidence}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-bull" style={{ width: `${r.confidence}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-white/5 bg-base-800/60 py-2">
          <p className="text-[11px] text-slate-500">Entry</p>
          <p className="num text-sm font-semibold text-slate-100">{num(r.entry)}</p>
        </div>
        <div className="rounded-lg border border-bear/20 bg-bear-soft py-2">
          <p className="text-[11px] text-slate-500">Stop-Loss</p>
          <p className="num text-sm font-semibold text-bear">{num(r.stopLoss)}</p>
        </div>
        <div className="rounded-lg border border-bull/20 bg-bull-soft py-2">
          <p className="text-[11px] text-slate-500">Target</p>
          <p className="num text-sm font-semibold text-bull">{num(r.target)}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {r.rationale.map((point, i) => (
          <li key={i} className="flex gap-2 text-xs text-slate-400">
            <span className="mt-0.5 text-accent">▸</span>
            {point}
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-md border border-white/5 bg-base-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        ⚠️ Not investment advice. AI output is a hypothesis and may be wrong. Trading involves risk of loss.
      </p>
    </Card>
  );
}
