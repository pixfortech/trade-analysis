import { Card } from "@/components/ui/Card";
import { sentimentGauges } from "@/lib/mockData";
import { signalClasses } from "@/lib/format";

export function MarketSentiment() {
  return (
    <Card id="sentiment" title="Market Sentiment" subtitle="Composite gauges · sample data (not live)">
      <div className="space-y-4">
        {sentimentGauges.map((g) => {
          const s = signalClasses(g.signal);
          return (
            <div key={g.label}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-300">{g.label}</span>
                <span className={`num font-medium ${s.text}`}>{g.value}/100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
                <div className={`h-full rounded-full ${s.dot}`} style={{ width: `${g.value}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Sentiment is a context indicator, not a trade trigger. Values are placeholder composites.
      </p>
    </Card>
  );
}
