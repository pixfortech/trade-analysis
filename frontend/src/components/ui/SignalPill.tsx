import type { Signal } from "@/types";
import { signalClasses } from "@/lib/format";

/** Colour-coded bullish / bearish / neutral pill. */
export function SignalPill({ signal, label }: { signal: Signal; label?: string }) {
  const s = signalClasses(signal);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.bg} ${s.border} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}
