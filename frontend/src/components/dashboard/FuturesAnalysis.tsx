import { Card } from "@/components/ui/Card";
import { SignalPill } from "@/components/ui/SignalPill";
import { futuresRows } from "@/lib/mockData";
import { changeTextClass, num, pct, signalClasses } from "@/lib/format";

export function FuturesAnalysis() {
  return (
    <Card id="futures" title="Futures Analysis" subtitle="Basis & OI build-up · demo data">
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[540px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium sm:px-5">Symbol</th>
              <th className="px-4 py-2 font-medium">Expiry</th>
              <th className="px-4 py-2 text-right font-medium">LTP</th>
              <th className="px-4 py-2 text-right font-medium">Basis</th>
              <th className="px-4 py-2 text-right font-medium">OI Δ</th>
              <th className="px-4 py-2 font-medium sm:px-5">Interpretation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {futuresRows.map((row) => (
              <tr key={row.symbol} className="transition-colors hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-slate-100 sm:px-5">{row.symbol}</td>
                <td className="px-4 py-3 text-slate-400">{row.expiry}</td>
                <td className="num px-4 py-3 text-right text-slate-100">{num(row.ltp)}</td>
                <td className="num px-4 py-3 text-right text-slate-300">{row.basis.toFixed(1)}</td>
                <td className={`num px-4 py-3 text-right ${changeTextClass(row.oiChangePercent)}`}>{pct(row.oiChangePercent)}</td>
                <td className="px-4 py-3 sm:px-5">
                  <span className={`text-xs font-medium ${signalClasses(row.signal).text}`}>{row.interpretation}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <SignalPill signal="bullish" label="Long Buildup" />
        <SignalPill signal="bearish" label="Short Buildup" />
        <span>· placeholder classification</span>
      </div>
    </Card>
  );
}
