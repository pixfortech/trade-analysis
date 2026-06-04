"use client";

import { useState } from "react";
import { DASHBOARD_CARDS, titleFor } from "@/lib/dashboardLayout";

/**
 * Dashboard customisation panel (Phase 3H). Show/hide widgets and reset the
 * layout. Live-data widgets are listed first; sample/simulation widgets are
 * grouped separately and clearly labelled. Visibility persists via the parent.
 */
export function CustomizePanel({
  visible,
  onToggle,
  onReset,
}: {
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const liveCards = DASHBOARD_CARDS.filter((c) => c.live);
  const sampleCards = DASHBOARD_CARDS.filter((c) => !c.live);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Show / hide widgets"
        aria-label="Customise"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-base-800 px-2.5 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-base-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">Customise</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setOpen(false)}>
          <aside
            className="h-full w-full max-w-sm overflow-auto border-l border-white/10 bg-base-900 p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Customise dashboard</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-slate-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-400">
              Show or hide widgets. Use <span className="text-slate-200">Arrange widgets</span> on the dashboard to
              drag and resize them. Your choices are saved in this browser.
            </p>

            <Section title="Live data">
              {liveCards.map((c) => (
                <Row key={c.id} id={c.id} on={Boolean(visible[c.id])} onToggle={onToggle} />
              ))}
            </Section>

            <Section title="Sample / simulation (not live data)">
              {sampleCards.map((c) => (
                <Row key={c.id} id={c.id} on={Boolean(visible[c.id])} onToggle={onToggle} />
              ))}
            </Section>

            <button
              type="button"
              onClick={onReset}
              className="mt-5 w-full rounded-lg border border-white/10 bg-base-800/70 px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-base-700"
            >
              Reset layout to default
            </button>
          </aside>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function Row({ id, on, onToggle }: { id: string; on: boolean; onToggle: (id: string) => void }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5">
      <label className="flex flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={on} onChange={() => onToggle(id)} className="h-4 w-4 accent-blue-500" />
        <span className={`text-[15px] ${on ? "text-slate-100" : "text-slate-500"}`}>{titleFor(id)}</span>
      </label>
    </li>
  );
}
