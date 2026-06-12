import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/ui/Sparkline";
import { marketIndices } from "@/lib/mockData";
import { changeTextClass, num, pct, signed } from "@/lib/format";

export function MarketOverview() {
  return (
    <Card id="overview" title="Market Overview" subtitle="Key indices · sample data (not live)">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {marketIndices.map((idx) => {
          const up = idx.change >= 0;
          return (
            <div key={idx.symbol} className="rounded-lg border border-white/5 bg-base-800/60 p-4 transition-colors hover:border-white/10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{idx.name}</p>
                  <p className="eyebrow text-slate-500">{idx.symbol}</p>
                </div>
                <Sparkline data={idx.spark} positive={up} />
              </div>
              <p className="num mt-3 text-2xl font-bold tracking-tight text-slate-100">{num(idx.ltp)}</p>
              <p className={`num mt-0.5 text-sm font-semibold ${changeTextClass(idx.change)}`}>
                {signed(idx.change)} ({pct(idx.changePercent)})
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
