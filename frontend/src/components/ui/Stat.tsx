import { changeTextClass } from "@/lib/format";

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  changeValue?: number;
}

/** Compact label/value stat with optional colour-coded sub line. */
export function Stat({ label, value, sub, changeValue }: StatProps) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="num mt-1 text-base font-semibold text-slate-100">{value}</p>
      {sub && (
        <p className={`num mt-0.5 text-xs ${changeValue !== undefined ? changeTextClass(changeValue) : "text-slate-400"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
