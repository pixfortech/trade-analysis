import { Card } from "@/components/ui/Card";
import { SignalPill } from "@/components/ui/SignalPill";
import { scannerRows } from "@/lib/mockData";
import { changeTextClass, num, pct } from "@/lib/format";

export function ScannerPlaceholder() {
  return (
    <Card
      id="scanner"
      title="Scanner"
      subtitle="Setups across segments · placeholder"
      action={
        <button
          type="button"
          className="cursor-not-allowed rounded-lg border border-white/5 bg-base-800/60 px-3 py-1.5 text-xs text-slate-500"
          disabled
        >
          Configure filters (soon)
        </button>
      }
    >
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium sm:px-5">Symbol</th>
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 font-medium">Setup</th>
              <th className="px-4 py-2 text-right font-medium">LTP</th>
              <th className="px-4 py-2 text-right font-medium">Chg</th>
              <th className="px-4 py-2 text-right font-medium sm:px-5">Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {scannerRows.map((row) => (
              <tr key={row.symbol} className="transition-colors hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-slate-100 sm:px-5">{row.symbol}</td>
                <td className="px-4 py-3 text-slate-400">{row.segment}</td>
                <td className="px-4 py-3 text-slate-300">{row.setup}</td>
                <td className="num px-4 py-3 text-right text-slate-100">{num(row.ltp)}</td>
                <td className={`num px-4 py-3 text-right ${changeTextClass(row.changePercent)}`}>{pct(row.changePercent)}</td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <div className="flex justify-end">
                    <SignalPill signal={row.signal} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
