"use client";

import { useState } from "react";

/**
 * Adds an "Expand / Collapse" control that promotes the SAME content node to a
 * fullscreen overlay (no duplicate mount, so live polling/state isn't doubled).
 * When expanded, the wrapper becomes position:fixed covering the viewport.
 */
export function Expandable({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={open ? "fixed inset-0 z-50 flex flex-col bg-base-950/95 backdrop-blur" : "flex h-full min-h-0 flex-col"}>
      <div className={`flex shrink-0 items-center ${open ? "justify-between border-b border-white/10 px-4 py-3" : "justify-end px-1 pb-1"}`}>
        {open && <h2 className="text-lg font-semibold text-slate-100">{title}</h2>}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-base-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-slate-100"
          title={open ? "Collapse" : "Expand to fullscreen"}
        >
          {open ? (
            <>✕ Close</>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Expand
            </>
          )}
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto ${open ? "mx-auto w-full max-w-[1100px] p-4 sm:p-6" : ""}`}>{children}</div>
    </div>
  );
}
