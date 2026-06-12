"use client";

import { num } from "@/lib/format";
import { toneVisual } from "@/lib/actionStyles";
import { Metric } from "@/components/ui/Metric";
import { MIN_SETUP_STRENGTH, MIN_WIN_ESTIMATE, type GuidanceCheck, type PlanEval, type TradePlanSnapshot } from "@/lib/tradePlan";

/**
 * Locked Trade Plan panel. Shows the LOCKED entry/SL/targets (with a 🔒) and the
 * live action from CMP vs those levels. CMP and distances update live; the levels
 * do not move until Re-analyse / invalidation. ENTER/EXIT approvals need ≥75%.
 */
export function TradeGuidance({ plan, evalResult, onReanalyse }: { plan: TradePlanSnapshot; evalResult: PlanEval; onReanalyse: () => void }) {
  const v = toneVisual(evalResult.tone);
  const long = plan.direction === "LONG";
  const dirV = toneVisual(long ? "bull" : "bear");
  const invalid = evalResult.state === "INVALIDATED";
  const zone = plan.safeLow != null && plan.safeHigh != null ? `₹${num(plan.safeLow)}–₹${num(plan.safeHigh)}` : "—";

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-base-850">
      {/* Action-state accent strip — colour tells you the state at a glance. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${v.bar}`} />
      <div className="p-3 pl-4 sm:p-4 sm:pl-5">
        {/* header */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-slate-400" aria-hidden>
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
            </svg>
            <h3 className="eyebrow text-slate-400">Locked Trade Plan</h3>
            {plan.direction !== "WAIT" && (
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${dirV.chip}`}>{plan.direction}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">levels locked @ {new Date(plan.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <button type="button" onClick={onReanalyse} className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden>
                <polyline points="23 4 23 10 17 10" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Re-analyse
            </button>
          </div>
        </div>

        {/* action + live CMP — the hero row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-base font-extrabold uppercase tracking-tight sm:text-lg ${v.chip}`}>{evalResult.label}</span>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bull" /></span>
              Live CMP
            </p>
            <p className="num text-2xl font-bold leading-none tracking-tight text-slate-100">{evalResult.cmp == null ? "—" : num(evalResult.cmp)}</p>
          </div>
        </div>

        {/* invalidated → de-emphasise old confidence, require re-analyse */}
        {invalid && (
          <p className="mt-3 rounded-lg border border-bear/50 bg-bear-soft px-3 py-2 text-xs font-bold text-bear">
            ⚠️ Plan void — Re-analyse required. The locked setup is no longer valid; the old confidence no longer applies.
          </p>
        )}

        {/* three clearly-labelled, distinct metrics */}
        {plan.direction !== "WAIT" && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <Metric label="Win estimate" value={`${plan.winEstimate}%`} sub="backend probability" tone={invalid ? "dim" : plan.winEstimate >= MIN_WIN_ESTIMATE ? "bull" : "warn"} />
              <Metric label="Setup strength" value={`${plan.setupStrength}%`} sub="indicators @ analysis" tone={invalid ? "dim" : plan.setupStrength >= MIN_SETUP_STRENGTH ? "bull" : "warn"} />
              <Metric label="Current approval" value={invalid ? "Void" : evalResult.approved ? `${evalResult.currentApproval}%` : "No"} sub={evalResult.approvalLabel} tone={invalid ? "bear" : evalResult.approved ? "bull" : "warn"} />
            </div>
            {!invalid && (
              <p className="mt-1.5 text-center text-[10px] text-slate-500">
                Approval needs <span className="font-semibold text-slate-400">win estimate ≥{MIN_WIN_ESTIMATE}%</span> AND <span className="font-semibold text-slate-400">setup strength ≥{MIN_SETUP_STRENGTH}%</span> AND CMP in the safe zone.
              </p>
            )}
          </>
        )}

        {/* reason */}
        <p className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${v.chip}`}>{evalResult.reason}</p>

        {/* distances */}
        {plan.direction !== "WAIT" && (
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <Dist label="to Entry" v={evalResult.distToEntry} />
            <Dist label="to Stop" v={evalResult.distToStop} tone="bear" />
            <Dist label="to Target 1" v={evalResult.distToTarget} tone="bull" />
          </div>
        )}

        {/* locked levels */}
        {plan.direction !== "WAIT" && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
          <div className="mt-3">
            <p className="eyebrow text-slate-400">Confirmations at analysis — entry needs most green</p>
            <ul className="mt-1.5 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              {plan.checks.map((c, i) => (
                <Check key={i} c={c} />
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[10px] leading-relaxed text-neutralSignal">
          🔒 Levels are locked for this analysis cycle (CMP stays live). Re-analyse to refresh. Disciplined risk control, not a guarantee. {plan.disclaimer}
        </p>
      </div>
    </div>
  );
}

function Dist({ label, v, tone }: { label: string; v: number | null; tone?: "bull" | "bear" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-slate-200";
  const sign = v == null ? "" : v > 0 ? "+" : "";
  return (
    <div className="rounded-lg border border-white/10 bg-base-800/60 px-1.5 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</p>
      <p className={`num text-xs font-bold ${v == null ? "text-slate-500" : c}`}>{v == null ? "—" : `${sign}${num(v)}`}</p>
    </div>
  );
}

function Lvl({ label, value, text, tone, locked }: { label: string; value?: number | null; text?: string; tone: "info" | "bull" | "bear" | "warn"; locked?: boolean }) {
  const c = toneVisual(tone).text;
  const display = text != null ? text : value == null ? "—" : `₹${num(value)}`;
  const dim = text == null && value == null;
  return (
    <div className="rounded-lg border border-white/10 bg-base-900/40 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">
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
