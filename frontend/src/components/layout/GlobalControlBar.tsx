"use client";

import { useEffect } from "react";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { FontSizeControl } from "./FontSizeControl";

/**
 * Global live-monitoring / alerts / font-size bar (Phase 3M redesign).
 * A clean, elevated card (not a flat grey strip) that adapts to light & dark
 * via the shared base tokens + html.light overrides. Shows colour-coded Kite /
 * market / live / alerts status, a numeric font-size control, and an advisory
 * note. Responsive: one row on desktop, wrapped/stacked on small screens.
 */
export function GlobalControlBar() {
  const kite = useAsync(api.kite.status);
  const market = useAsync(api.marketStatus);
  const g = useGlobalControls();

  useEffect(() => {
    void kite.run();
    void market.run();
    const id = window.setInterval(() => {
      void kite.run();
      void market.run();
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const k = kite.data;
  const authed = !!k?.liveDataEnabled && !!k?.authenticated;
  const loginRequired = !!k?.liveDataEnabled && !!k?.configured && !k?.authenticated;
  const m = market.data;
  const marketOpen = m?.status === "open";

  return (
    <section className="mb-5 rounded-2xl border border-white/10 bg-base-850/70 px-3 py-2.5 shadow-card backdrop-blur sm:px-4">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Status + live/alerts toggles */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {kite.isError ? (
            <Badge tone="red" dot>Backend offline</Badge>
          ) : authed ? (
            <Badge tone="blue" dot>Live Kite · Read-Only</Badge>
          ) : loginRequired ? (
            <Badge tone="amber">Login required</Badge>
          ) : (
            <Badge tone="grey">Live data off</Badge>
          )}

          {m && (
            <Badge tone={marketOpen ? "green" : "grey"} dot={marketOpen}>
              Market {m.status.replace("-", " ")}
            </Badge>
          )}

          <span className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" />

          <button
            type="button"
            onClick={g.toggleLiveUpdates}
            aria-pressed={g.liveUpdates}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              g.liveUpdates ? "border-bull/40 bg-bull-soft text-bull" : "border-white/10 bg-base-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${g.liveUpdates ? "bg-bull" : "bg-slate-500"}`} />
            Live updates {g.liveUpdates ? "ON" : "OFF"}
          </button>

          {g.alertsEnabled ? (
            <button
              type="button"
              onClick={g.disableAlerts}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"
            >
              <span className="h-2 w-2 rounded-full bg-accent" />
              Alerts ON
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void g.enableAlerts()}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutralSignal/40 bg-neutralSignal-soft px-3 py-1 text-xs font-semibold text-neutralSignal hover:brightness-110"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Enable alerts
            </button>
          )}
        </div>

        {/* Font size + advisory note */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:shrink-0 lg:justify-end">
          <FontSizeControl />
          <span className="text-[11px] text-slate-500">Advisory · read-only · no order execution</span>
        </div>
      </div>
    </section>
  );
}

const TONES: Record<string, string> = {
  green: "border-bull/40 bg-bull-soft text-bull",
  blue: "border-accent/40 bg-accent/10 text-accent",
  amber: "border-neutralSignal/40 bg-neutralSignal-soft text-neutralSignal",
  red: "border-bear/40 bg-bear-soft text-bear",
  grey: "border-white/10 bg-base-800 text-slate-400",
};

function Badge({ tone, dot, children }: { tone: keyof typeof TONES; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${TONES[tone]}`}>
      {dot && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
