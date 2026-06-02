"use client";

import type { AlertItem } from "@/hooks/useAlerts";

const SEV_CLS: Record<string, string> = {
  info: "border-accent/30 bg-base-850",
  caution: "border-neutralSignal/40 bg-base-850",
  urgent: "border-bear/50 bg-base-850",
};
const SEV_DOT: Record<string, string> = {
  info: "bg-accent",
  caution: "bg-neutralSignal",
  urgent: "bg-bear",
};

/** Fixed toast stack for advisory alerts (read-only). */
export function AlertToasts({ toasts, onDismiss }: { toasts: AlertItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-xl border p-3 shadow-card ${SEV_CLS[t.severity]}`} role="alert">
          <div className="flex items-start gap-2.5">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${SEV_DOT[t.severity]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100">{t.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.body}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
