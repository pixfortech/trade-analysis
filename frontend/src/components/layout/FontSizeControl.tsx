"use client";

import { FONT_DEFAULT, FONT_MAX, FONT_MIN, useGlobalControls } from "@/hooks/useGlobalControls";

/**
 * Numeric global font-size control (Phase 3M): A− · slider · value · A+ · reset.
 * Writes a px value to the global store, which sets the inline
 * `--app-base-font-size` custom property on <html> and scales the whole
 * rem-based UI. Persisted in localStorage; adapts to light/dark via base tokens.
 */
export function FontSizeControl() {
  const g = useGlobalControls();
  const atMin = g.fontSizePx <= FONT_MIN;
  const atMax = g.fontSizePx >= FONT_MAX;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-base-800/60 px-2 py-1">
      <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">Font</span>
      <button
        type="button"
        onClick={g.decreaseFont}
        disabled={atMin}
        aria-label="Decrease font size"
        title="Decrease font size"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30"
      >
        A<span className="text-[10px]">−</span>
      </button>
      <input
        type="range"
        min={FONT_MIN}
        max={FONT_MAX}
        step={1}
        value={g.fontSizePx}
        onChange={(e) => g.setFontSizePx(Number(e.target.value))}
        aria-label="Font size in pixels"
        className="h-1.5 w-16 cursor-pointer sm:w-28"
        style={{ accentColor: "#3b82f6" }}
      />
      <span className="num w-9 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-200">{g.fontSizePx}px</span>
      <button
        type="button"
        onClick={g.increaseFont}
        disabled={atMax}
        aria-label="Increase font size"
        title="Increase font size"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[15px] font-bold text-slate-200 hover:bg-white/10 disabled:opacity-30"
      >
        A<span className="text-[11px]">+</span>
      </button>
      <button
        type="button"
        onClick={g.resetFont}
        aria-label="Reset font size to default"
        title={`Reset to ${FONT_DEFAULT}px`}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-200"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
          <polyline points="1 4 1 10 7 10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
