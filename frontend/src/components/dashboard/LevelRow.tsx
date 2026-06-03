import { num } from "@/lib/format";

export type LevelTone = "entry" | "stop" | "target" | "support" | "resistance" | "neutral";

const TONES: Record<LevelTone, { wrap: string; value: string }> = {
  entry: { wrap: "border-accent/30 bg-accent/5", value: "text-accent" },
  stop: { wrap: "border-bear/30 bg-bear-soft", value: "text-bear" },
  target: { wrap: "border-bull/30 bg-bull-soft", value: "text-bull" },
  support: { wrap: "border-bull/20 bg-bull-soft", value: "text-bull" },
  resistance: { wrap: "border-bear/20 bg-bear-soft", value: "text-bear" },
  neutral: { wrap: "border-white/10 bg-base-800/60", value: "text-slate-100" },
};

/**
 * A prominent, bold trading level with a one-line "why it matters / what
 * confirms it" explanation. Used across the AI Recommendation and Live Signal
 * so entry/SL/targets read clearly.
 */
export function LevelRow({
  label,
  value,
  tone = "neutral",
  explanation,
  prefix = "₹",
}: {
  label: string;
  value: number | string | null;
  tone?: LevelTone;
  explanation?: string;
  prefix?: string;
}) {
  const t = TONES[tone];
  const display = value == null ? "Unavailable" : typeof value === "number" ? `${prefix}${num(value)}` : value;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${t.wrap}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <span className={`num text-lg font-bold ${value == null ? "text-slate-500" : t.value}`}>{display}</span>
      </div>
      {explanation && <p className="mt-1 text-xs leading-relaxed text-slate-400">{explanation}</p>}
    </div>
  );
}
