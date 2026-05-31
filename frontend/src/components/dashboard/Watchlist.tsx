import { Card } from "@/components/ui/Card";
import { watchlist } from "@/lib/mockData";
import { changeTextClass, num, pct } from "@/lib/format";

export function Watchlist() {
  return (
    <Card
      id="watchlist"
      title="Watchlist"
      subtitle="Tracked instruments"
      action={<span className="text-xs text-slate-500">{watchlist.length} symbols</span>}
    >
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium sm:px-5">Symbol</th>
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 text-right font-medium">LTP</th>
              <th className="px-4 py-2 text-right font-medium sm:px-5">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {watchlist.map((row) => (
              <tr key={row.symbol} className="transition-colors hover:bg-white/5">
                <td className="px-4 py-3 sm:px-5">
                  <p className="font-medium text-slate-100">{row.symbol}</p>
                  <p className="text-[11px] text-slate-500">{row.name}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md border border-white/5 bg-base-800/60 px-2 py-0.5 text-[11px] text-slate-400">
                    {row.segment}
                  </span>
                </td>
                <td className="num px-4 py-3 text-right text-slate-100">{num(row.ltp)}</td>
                <td className={`num px-4 py-3 text-right sm:px-5 ${changeTextClass(row.change)}`}>{pct(row.changePercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
