"use client";

import { useEffect } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";

/**
 * Top bar: title + a REAL data-mode badge derived from the backend Kite status
 * (Live Kite Read-Only / Login Required / Backend Offline). No demo labels,
 * no dead search.
 */
export function Header() {
  const status = useAsync(api.kite.status);

  useEffect(() => {
    void status.run();
    const id = window.setInterval(() => void status.run(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const d = status.data;
  let badge: { text: string; cls: string; pulse: boolean };
  if (status.isError) {
    badge = { text: "Backend offline", cls: "border-bear/30 bg-bear-soft text-bear", pulse: false };
  } else if (!d) {
    badge = { text: "Checking…", cls: "border-white/10 bg-base-800 text-slate-400", pulse: false };
  } else if (d.liveDataEnabled && d.authenticated) {
    badge = { text: "Live Kite · Read-Only", cls: "border-bull/30 bg-bull-soft text-bull", pulse: true };
  } else if (d.liveDataEnabled && d.configured) {
    badge = { text: "Login required", cls: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal", pulse: false };
  } else {
    badge = { text: "Live data disabled", cls: "border-white/10 bg-base-800 text-slate-400", pulse: false };
  }

  return (
    <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold text-slate-100 sm:text-2xl">Dashboard</h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
            {badge.pulse && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-bull" />
              </span>
            )}
            {badge.text}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Indian markets · Equity · Futures · Options — live read-only via Zerodha Kite
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <ThemeToggle />
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-sm font-semibold text-accent">A</div>
      </div>
    </header>
  );
}
