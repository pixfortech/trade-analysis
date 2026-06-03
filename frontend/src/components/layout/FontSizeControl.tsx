"use client";

import { useEffect, useRef, useState } from "react";
import { FONT_SCALES, FONT_SCALE_LABEL, useGlobalControls, type FontScale } from "@/hooks/useGlobalControls";

/**
 * Visible global Font Size control (Phase 3L). A−/A+ steppers plus a popover
 * with the four named presets (Compact / Normal / Large / Extra Large) and a
 * reset. Selection is global (html.font-* + CSS var) and persisted; changing it
 * pokes a resize so the dashboard cards re-fit.
 */
export function FontSizeControl() {
  const g = useGlobalControls();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = g.fontScale;
  const atMin = FONT_SCALES.indexOf(current) === 0;
  const atMax = FONT_SCALES.indexOf(current) === FONT_SCALES.length - 1;

  return (
    <div ref={ref} className="relative">
      <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-base-800 p-0.5">
        <button
          type="button"
          onClick={g.decreaseFont}
          disabled={atMin}
          aria-label="Decrease font size"
          title="Decrease font size"
          className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-slate-300 hover:bg-white/10 disabled:opacity-30"
        >
          A<span className="text-[9px]">−</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Font size"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
        >
          <span className="font-bold">Aa</span>
          <span className="hidden sm:inline">{FONT_SCALE_LABEL[current]}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 opacity-60">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={g.increaseFont}
          disabled={atMax}
          aria-label="Increase font size"
          title="Increase font size"
          className="grid h-7 w-7 place-items-center rounded-full text-[15px] font-bold text-slate-300 hover:bg-white/10 disabled:opacity-30"
        >
          A<span className="text-[11px]">+</span>
        </button>
      </div>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-white/10 bg-base-850 p-2 shadow-card">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Font size</p>
          {FONT_SCALES.map((s: FontScale) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === current}
              onClick={() => g.setFontScale(s)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                s === current ? "bg-accent/15 text-accent" : "text-slate-300 hover:bg-white/5"
              }`}
            >
              <span className="font-medium">{FONT_SCALE_LABEL[s]}</span>
              <span
                aria-hidden
                className="font-bold leading-none text-slate-400"
                style={{ fontSize: s === "compact" ? 12 : s === "normal" ? 15 : s === "large" ? 18 : 22 }}
              >
                A
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => g.resetFont()}
            className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-400 hover:bg-white/5"
          >
            Reset to Normal
          </button>
        </div>
      )}
    </div>
  );
}
