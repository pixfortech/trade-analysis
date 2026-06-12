import type { ReactNode } from "react";
import { toneVisual, type ActionTone } from "@/lib/actionStyles";

interface CardProps {
  id?: string;
  title?: string;
  subtitle?: string;
  /** Tiny uppercase tracked label above the title (design "eyebrow"). */
  eyebrow?: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** Action-state accent: shows a left strip + tints the header + icon. */
  accent?: ActionTone;
  children: ReactNode;
  className?: string;
  /** Drop the internal body padding (callers that manage their own). */
  flush?: boolean;
}

/** Reusable dashboard card with an optional header and action-state accent. */
export function Card({ id, title, subtitle, eyebrow, icon, action, accent, children, className = "", flush = false }: CardProps) {
  const v = accent ? toneVisual(accent) : null;
  return (
    <section id={id} className={`card relative flex h-full min-h-0 scroll-mt-6 flex-col ${className}`}>
      {/* Action-state accent: an inset left strip that colour-codes the card. */}
      {v && <span aria-hidden className={`pointer-events-none absolute bottom-3 left-0 top-3 w-1 rounded-full ${v.bar}`} />}
      {(title || action || eyebrow) && (
        <header
          className={`flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5 ${v ? v.soft : ""}`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className={`shrink-0 ${v ? v.text : "text-slate-400"}`}>{icon}</span>}
            <div className="min-w-0">
              {eyebrow && <p className="eyebrow text-slate-500">{eyebrow}</p>}
              {title && <h2 className="truncate text-[15px] font-bold tracking-tight text-slate-100">{title}</h2>}
              {subtitle && <p className="truncate text-xs font-medium text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {/* Body scrolls internally so content never spills out of the grid cell. */}
      <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${flush ? "" : "card-pad"}`}>{children}</div>
    </section>
  );
}
