"use client";

import { num } from "@/lib/format";
import { buildTradeGuidance, type EntryStatus, type GuidanceCheck } from "@/lib/tradeGuidance";
import type { LiveSignal } from "@/types/api";

const STATUS_CLS: Record<EntryStatus, string> = {
  ENTER_NOW: "border-bull/50 bg-bull-soft text-bull",
  WAIT_BREAKOUT: "border-accent/50 bg-accent/10 text-accent",
  WAIT_PULLBACK: "border-neutralSignal/50 bg-neutralSignal-soft text-neutralSignal",
  WAIT_SETUP: "border-white/15 bg-base-800 text-slate-300",
  AVOID: "border-bear/50 bg-bear-soft text-bear",
};

/**
 * Enter → Hold → Exit guidance built from the live indicators. A precise,
 * indicator-grounded plan: what must confirm before entering, where to enter,
 * what keeps you in, and the exact stop/exit rules to cap losses. Advisory only.
 */
export function TradeGuidance({ signal }: { signal: LiveSignal }) {
  const g = buildTradeGuidance(signal);
  const long = g.side === "LONG";

  return (
    <div className="rounded-xl border border-white/10 bg-base-850 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-100">Trade Guidance</h3>
          <span className="text-[11px] font-medium text-slate-500">Enter → Hold → Exit</span>
        </div>
        <div className="flex items-center gap-2">
          {g.side !== "WAIT" && (
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${long ? "border-bull/40 bg-bull-soft text-bull" : "border-bear/40 bg-bear-soft text-bear"}`}>{g.side}</span>
          )}
          {g.riskReward && <span className="rounded-md border border-white/10 bg-base-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">R:R {g.riskReward}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* 1 — ENTER */}
        <Step n={1} title="Enter" accent="accent">
          <span className={`mb-2 inline-flex items-center rounded-md border px-2 py-1 text-xs font-bold uppercase tracking-wide ${STATUS_CLS[g.entry.status]}`}>{g.entry.label}</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Lvl label="Entry trigger" value={g.entry.trigger} tone="accent" />
            <Lvl label="Safe zone" lo={g.entry.safeLow} hi={g.entry.safeHigh} tone="accent" />
          </div>
          {g.entry.total > 0 && (
            <>
              <p className="mt-2.5 text-[11px] font-semibold text-slate-400">
                Confirmations <span className={g.entry.confirmed >= Math.ceil(g.entry.total * 0.6) ? "text-bull" : "text-neutralSignal"}>{g.entry.confirmed}/{g.entry.total}</span> — enter only when most are green:
              </p>
              <ul className="mt-1 space-y-1">
                {g.entry.checks.map((c, i) => (
                  <Check key={i} c={c} />
                ))}
              </ul>
            </>
          )}
          <Note>{g.entry.note}</Note>
        </Step>

        {/* 2 — HOLD */}
        <Step n={2} title="Hold" accent="neutral">
          {g.hold.conditions.length > 0 ? (
            <>
              <p className="text-[11px] font-semibold text-slate-400">Stay in while:</p>
              <ul className="mt-1 space-y-1">
                {g.hold.conditions.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-300">
                    <span className="mt-0.5 text-bull">●</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                <Lvl label="Trail stop to" value={g.hold.trail} tone="warn" />
              </div>
            </>
          ) : (
            <p className="text-[11px] text-slate-500">{g.hold.note}</p>
          )}
          {g.hold.conditions.length > 0 && <Note>{g.hold.note}</Note>}
        </Step>

        {/* 3 — EXIT */}
        <Step n={3} title="Exit" accent="bear">
          <div className="grid grid-cols-2 gap-1.5">
            <Lvl label="Hard stop (loss line)" value={g.exit.hardStop} tone="bear" />
            <Lvl label="Book partial @ T1" value={g.exit.bookPartial} tone="bull" />
          </div>
          {g.exit.targets.some((t) => t != null) && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Targets: {g.exit.targets.map((t, i) => (t == null ? null : <span key={i} className="num font-semibold text-bull">{i > 0 ? " · " : ""}₹{num(t)}</span>))}
            </p>
          )}
          {g.exit.signals.length > 0 && (
            <>
              <p className="mt-2 text-[11px] font-semibold text-slate-400">Exit immediately if:</p>
              <ul className="mt-1 space-y-1">
                {g.exit.signals.map((sig, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-300">
                    <span className="mt-0.5 text-bear">▴</span>
                    <span>{sig}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Note>{g.exit.note}</Note>
        </Step>
      </div>

      <p className="mt-3 rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[10px] leading-relaxed text-neutralSignal">
        ⚠️ Disciplined risk control, not a guarantee. {g.disclaimer}
      </p>
    </div>
  );
}

function Step({ n, title, accent, children }: { n: number; title: string; accent: "accent" | "neutral" | "bear"; children: React.ReactNode }) {
  const badge = accent === "accent" ? "bg-accent/20 text-accent" : accent === "bear" ? "bg-bear/20 text-bear" : "bg-neutralSignal/20 text-neutralSignal";
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${badge}`}>{n}</span>
        <p className="text-xs font-bold text-slate-100">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Lvl({ label, value, lo, hi, tone }: { label: string; value?: number | null; lo?: number | null; hi?: number | null; tone: "accent" | "bull" | "bear" | "warn" }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "warn" ? "text-neutralSignal" : "text-accent";
  const display = lo != null || hi != null ? (lo == null || hi == null ? "—" : `₹${num(lo)}–₹${num(hi)}`) : value == null ? "—" : `₹${num(value)}`;
  const dim = (lo === undefined ? value == null : lo == null || hi == null);
  return (
    <div className="rounded-md border border-white/10 bg-base-900/40 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`num text-sm font-bold ${dim ? "text-slate-500" : c}`}>{display}</p>
    </div>
  );
}

function Check({ c }: { c: GuidanceCheck }) {
  const icon = c.met == null ? "—" : c.met ? "✓" : "✕";
  const cls = c.met == null ? "text-slate-500" : c.met ? "text-bull" : "text-slate-500";
  const textCls = c.met == null ? "text-slate-500" : c.met ? "text-slate-200" : "text-slate-500 line-through decoration-slate-600";
  return (
    <li className="flex items-start gap-1.5 text-[11px] leading-snug">
      <span className={`mt-0.5 w-3 shrink-0 text-center font-bold ${cls}`}>{icon}</span>
      <span className={textCls}>{c.label}</span>
    </li>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{children}</p>;
}
