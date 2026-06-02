import { ThemeToggle } from "./ThemeToggle";

/** Top bar: page title, market-status badge, mock search. */
export function Header() {
  return (
    <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Dashboard</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-bull/30 bg-bull-soft px-2.5 py-1 text-xs font-medium text-bull">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-bull" />
            </span>
            Market Open
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Indian markets · Equity · Futures · Options — <span className="text-slate-400">demo data</span>
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <label className="relative hidden sm:block">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            disabled
            placeholder="Search symbol… (soon)"
            className="w-56 cursor-not-allowed rounded-lg border border-white/5 bg-base-800/60 py-2 pl-9 pr-3 text-sm text-slate-300 placeholder:text-slate-600"
          />
        </label>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/5 bg-base-800/60 text-slate-400 transition-colors hover:text-slate-200"
          aria-label="Notifications"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ThemeToggle />
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-sm font-semibold text-accent">A</div>
      </div>
    </header>
  );
}
