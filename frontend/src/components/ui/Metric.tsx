import { toneVisual, type ActionTone } from "@/lib/actionStyles";

export type MetricTone = ActionTone | "dim";

/**
 * Labelled KPI tile used across the trade-decision panels (Win estimate /
 * Setup strength / Current approval, distances, etc.). Bold tabular value with
 * an uppercase micro-label; `dim` greys it out for void/invalidated states.
 */
export function Metric({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: MetricTone }) {
  const cls = tone === "dim" ? "border-white/10 bg-base-800/40 text-slate-500 opacity-70" : toneVisual(tone).chip;
  return (
    <div className={`rounded-lg border px-2 py-2 ${cls}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.08em] opacity-80">{label}</p>
      <p className="num mt-0.5 text-base font-bold leading-none tracking-tight sm:text-lg">{value}</p>
      {sub && <p className="mt-1 text-[8px] leading-tight opacity-70 sm:text-[9px]">{sub}</p>}
    </div>
  );
}
