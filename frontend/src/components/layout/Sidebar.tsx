"use client";

import { navItems } from "./navItems";
import { useGlobalControls } from "@/hooks/useGlobalControls";

/**
 * Desktop sidebar with three states (expanded / collapsed-icons / hidden) plus
 * a mobile off-canvas drawer. State + persistence live in useGlobalControls; the
 * grid remeasures automatically on toggle (pokeResize there).
 */
export function Sidebar() {
  const { sidebarMode, cycleSidebar, mobileDrawerOpen, setMobileDrawerOpen } = useGlobalControls();
  const collapsed = sidebarMode === "collapsed";

  return (
    <>
      {/* Desktop sidebar (hidden when sidebarMode === 'hidden') */}
      {sidebarMode !== "hidden" && (
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/5 bg-base-900/80 backdrop-blur transition-[width] duration-200 lg:flex ${
            collapsed ? "w-16" : "w-64"
          }`}
        >
          <Brand collapsed={collapsed} onToggle={cycleSidebar} />
          <Nav collapsed={collapsed} />
          {!collapsed && (
            <div className="border-t border-white/5 px-5 py-4">
              <p className="text-xs leading-relaxed text-slate-500">
                Live read-only market data via Zerodha Kite. Advisory analysis only — no order execution.
              </p>
            </div>
          )}
        </aside>
      )}

      {/* Mobile off-canvas drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-white/10 bg-base-900 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <Brand collapsed={false} />
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <Nav collapsed={false} onNavigate={() => setMobileDrawerOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

function Brand({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-5 ${collapsed ? "justify-center" : "px-5"}`}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path d="M4 18L10 12L14 16L20 8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 8h5v5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-slate-100">AI Market</p>
          <p className="text-xs text-slate-500">Analysis Tool</p>
        </div>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Toggle sidebar"
          title="Expand / collapse / hide sidebar"
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-slate-200 ${collapsed ? "mt-2" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Nav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
      {navItems.map((item, i) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${collapsed ? "justify-center" : ""} ${
            i === 0 ? "bg-accent/10 text-slate-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
        >
          <span className={`shrink-0 ${i === 0 ? "text-accent" : "text-slate-500 group-hover:text-slate-300"}`}>{item.icon}</span>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </a>
      ))}
    </nav>
  );
}
