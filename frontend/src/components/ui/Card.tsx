import type { ReactNode } from "react";

interface CardProps {
  id?: string;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Reusable dashboard card with an optional header. */
export function Card({ id, title, subtitle, icon, action, children, className = "" }: CardProps) {
  return (
    <section id={id} className={`card flex scroll-mt-6 flex-col ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-slate-400">{icon}</span>}
            <div>
              {title && <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>}
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="card-pad flex-1">{children}</div>
    </section>
  );
}
