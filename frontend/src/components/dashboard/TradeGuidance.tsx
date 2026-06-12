"use client";

import { num } from "@/lib/format";
import { MIN_ACTION_CONFIDENCE, type GuidanceCheck, type PlanEval, type PlanTone, type TradePlanSnapshot } from "@/lib/tradePlan";

const TONE: Record<PlanTone, { chip: string; text: string }> = {
  bull: { chip: "border-bull/50 bg-bull-soft text-bull", text: "text-bull" },
  bear: { chip: "border-bear/50 bg-bear-soft text-bear", text: "text-bear" },
  warn: { chip: "border-neutralSignal/50 bg-neutralSignal-soft text-neutralSignal", text: "text-neutralSignal" },
  info: { chip: "border-accent/50 bg-accent/10 text-accent", text: "text-accent" },
  neutral: { chip: "border-white/15 bg-base-800 text-slate-300", text: "text-slate-300" },
};

/**
 * Locked Trade Plan panel. Shows the LOCKED entry/SL/targets (with a 🔒) and the
 * live action from CMP vs those levels. CMP and distances update live; the levels
 * do not move until Re-analyse / invalidation. ENTER/EXIT approvals need ≥75%.
 */
export function TradeGuidance({ plan, evalResult, onReanalyse }: { plan: TradePlanSnapshot; evalResult: PlanEval; onReanalyse: () => void }) {
  const t = TONE[evalResult.tone];
  const long = plan.direction === "LONG";
  const confOk = plan.confidence >= MIN_ACTION_CONFIDENCE;
  const zone = plan.safeLow != null && plan.safeHigh != null ? `₹${num(plan.safeLow)}–₹${num(plan.safeHigh)}` : "—";

  return (
    <div className="rounded-xl border border-white/10 bg-base-850 p-3 sm:p-4">
      {/* header */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-slate-400" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          </svg>
          <h3 className="text-sm font-bold text-slate-100">Locked Trade Plan</h3>
          {plan.direction !== "WAIT" && (
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${long ? "border-bull/40 bg-bull-soft text-bull" : "border-bear/40 bg-bear-soft text-bear"}`}>{plan.direction}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">levels locked @ {new Date(plan.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          <button type="button" onClick={onReanalyse} className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden>
              <polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Re-analyse
          </button>
        </div>
      </div>

      {/* action + live CMP */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-bold uppercase tracking-wide ${t.chip}`}>{evalResult.label}</span>
        <div className="flex items-center gap-1.5 text-right">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bull" /></span>
          <span className="text-[10px] uppercase text-slate-500">Live CMP</span>
          <span className="num text-lg font-bold text-slate-100">{evalResult.cmp == null ? "—" : num(evalResult.cmp)}</span>
        </div>
      </div>

      {/* confidence vs threshold */}
      {plan.direction !== "WAIT" && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-400">Confidence (locked) <span className={confOk ? "font-bold text-bull" : "font-bold text-neutralSignal"}>{plan.confidence}%</span></span>
            <span className="text-slate-500">Approval requires ≥{MIN_ACTION_CONFIDENCE}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-700">
            <div className={`h-full ${confOk ? "bg-bull" : "bg-neutralSignal"}`} style={{ width: `${Math.min(100, plan.confidence)}%` }} />
          </div>
        </div>
      )}

      {/* reason */}
      <p className={`mt-2 rounded-lg border px-3 py-2 text-xs font-medium ${t.chip}`}>{evalResult.reason}</p>

      {/* distances */}
      {plan.direction !== "WAIT" && (
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <Dist label="to Entry" v={evalResult.distToEntry} />
          <Dist label="to Stop" v={evalResult.distToStop} tone="bear" />
          <Dist label="to Target 1" v={evalResult.distToTarget} tone="bull" />
        </div>
      )}

      {/* locked levels */}
      {plan.direction !== "WAIT" && (
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Lvl label="Entry" value={plan.entry} tone="info" locked />
          <Lvl label="Safe zone" text={zone} tone="info" locked />
          <Lvl label="Stop-loss" value={plan.stopLoss} tone="bear" locked />
          <Lvl label="Trail to" value={plan.trailStop} tone="warn" />
          <Lvl label="Target 1" value={plan.targets[0] ?? null} tone="bull" locked />
          <Lvl label="Target 2" value={plan.targets[1] ?? null} tone="bull" locked />
          <Lvl label="Target 3" value={plan.targets[2] ?? null} tone="bull" locked />
          <Lvl label="Invalidation" value={plan.invalidation} tone="bear" locked />
        </div>
      )}

      {/* confirmation checklist (locked at generation) */}
      {plan.checks.some((c) => c.met != null) && (
        <div className="mt-2.5">
          <p className="text-[11px] font-semibold text-slate-400">Confirmations at analysis — entry needs most green:</p>
          <ul className="mt-1 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            {plan.checks.map((c, i) => (
              <Check key={i} c={c} />
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2.5 rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[10px] leading-relaxed text-neutralSignal">
        🔒 Levels are locked for this analysis cycle (CMP stays live). Re-analyse to refresh. Disciplined risk control, not a guarantee. {plan.disclaimer}
      </p>
    </div>
  );
}

function Dist({ label, v, tone }: { label: string; v: number | null; tone?: "bull" | "bear" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-200";
  const sign = v == null ? "" : v > 0 ? "+" : "";
  return (
    <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1">
      <p className="text-[9px] uppercase text-slate-500">{label}</p>
      <p className={`num text-xs font-bold ${v == null ? "text-slate-500" : c}`}>{v == null ? "—" : `${sign}${num(v)}`}</p>
    </div>
  );
}

function Lvl({ label, value, text, tone, locked }: { label: string; value?: number | null; text?: string; tone: "info" | "bull" | "bear" | "warn"; locked?: boolean }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-neutralSignal" : "text-accent";
  const display = text != null ? text : value == null ? "—" : `₹${num(value)}`;
  const dim = text == null && value == null;
  return (
    <div className="rounded-md border border-white/10 bg-base-900/40 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-slate-500">
        {locked && <span aria-hidden>🔒</span>}
        {label}
      </p>
      <p className={`num text-sm font-bold ${dim ? "text-slate-500" : c}`}>{display}</p>
    </div>
  );
}

function Check({ c }: { c: GuidanceCheck }) {
  const icon = c.met == null ? "—" : c.met ? "✓" : "✕";
  const iconCls = c.met == null ? "text-slate-500" : c.met ? "text-bull" : "text-slate-500";
  const textCls = c.met == null ? "text-slate-500" : c.met ? "text-slate-200" : "text-slate-500 line-through decoration-slate-600";
  return (
    <li className="flex items-start gap-1.5 text-[11px] leading-snug">
      <span className={`mt-0.5 w-3 shrink-0 text-center font-bold ${iconCls}`}>{icon}</span>
      <span className={textCls}>{c.label}</span>
    </li>
  );
}
