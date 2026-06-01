"use client";

import { useState } from "react";
import type { CardState } from "@/lib/dashboardLayout";
import { titleFor } from "@/lib/dashboardLayout";

/**
 * Dashboard customisation panel (Phase 3D). Toggle card visibility, reorder
 * with up/down controls, and reset to default. Layout persists via the parent
 * (localStorage). Simple + stable — no drag-and-drop to avoid fragility.
 */
export function CustomizePanel({
  layout,
  onToggle,
  onMove,
  onReset,
}: {
  layout: CardState[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-base-800/70 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-base-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path d="M12 4v16M4 8h16M4 16h16" strokeLinecap="round" />
        </svg>
        Customise
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
              Show or hide cards and reorder them. Your layout is saved in this browser.
            </p>

            <ul className="space-y-2">
              {layout.map((card, i) => (
                <li
                  key={card.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-base-800/60 px-3 py-2.5"
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={card.visible}
                      onChange={() => onToggle(card.id)}
                      className="h-4 w-4 accent-blue-500"
                    />
                    <span className={`text-[15px] ${card.visible ? "text-slate-100" : "text-slate-500"}`}>
                      {titleFor(card.id)}
                    </span>
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onMove(card.id, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${titleFor(card.id)} up`}
                      className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(card.id, 1)}
                      disabled={i === layout.length - 1}
                      aria-label={`Move ${titleFor(card.id)} down`}
                      className="grid h-7 w-7 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={onReset}
              className="mt-5 w-full rounded-lg border border-white/10 bg-base-800/70 px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-base-700"
            >
              Reset to default layout
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
