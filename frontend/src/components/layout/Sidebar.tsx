import { navItems } from "./navItems";

/** Fixed vertical navigation (desktop / tablet). */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-base-900/80 backdrop-blur lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M4 18L10 12L14 16L20 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 8h5v5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-100">AI Market</p>
          <p className="text-[11px] text-slate-500">Analysis Tool</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              i === 0
                ? "bg-accent/10 text-slate-100"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            <span className={i === 0 ? "text-accent" : "text-slate-500 group-hover:text-slate-300"}>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>

      <div className="border-t border-white/5 px-5 py-4">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Phase 1 · Mock data only. Not investment advice.
        </p>
      </div>
    </aside>
  );
}
