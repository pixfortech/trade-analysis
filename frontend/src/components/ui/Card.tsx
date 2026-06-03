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
    <section id={id} className={`card flex h-full min-h-0 scroll-mt-6 flex-col ${className}`}>
      {(title || action) && (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="truncate text-sm font-semibold tracking-wide text-slate-100">{title}</h2>}
              {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {/* Body scrolls internally so content never spills out of the grid cell. */}
      <div className="card-pad min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
    </section>
  );
}
