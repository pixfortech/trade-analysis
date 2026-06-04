"use client";

import { FONT_DEFAULT, FONT_MAX, FONT_MIN, useGlobalControls } from "@/hooks/useGlobalControls";

/**
 * Minimal, flat global font-size control: A− · slider · value · A+ · reset.
 * Writes a px value to the global store (inline --app-base-font-size on <html>),
 * scaling the whole rem-based UI. No borders/pills — just clean inline controls.
 */
export function FontSizeControl() {
  const g = useGlobalControls();
  const atMin = g.fontSizePx <= FONT_MIN;
  const atMax = g.fontSizePx >= FONT_MAX;

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={g.decreaseFont}
        disabled={atMin}
        aria-label="Decrease font size"
        title="Decrease font size"
        className="text-[12px] font-bold leading-none text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-30"
      >
        A−
      </button>
      <input
        type="range"
        min={FONT_MIN}
        max={FONT_MAX}
        step={1}
        value={g.fontSizePx}
        onChange={(e) => g.setFontSizePx(Number(e.target.value))}
        aria-label="Font size in pixels"
        className="h-1 w-16 cursor-pointer sm:w-24"
        style={{ accentColor: "#3b82f6" }}
      />
      <button
        type="button"
        onClick={g.increaseFont}
        disabled={atMax}
        aria-label="Increase font size"
        title="Increase font size"
        className="text-[16px] font-bold leading-none text-slate-300 transition-colors hover:text-slate-100 disabled:opacity-30"
      >
        A+
      </button>
      <span className="num w-8 text-center text-[11px] font-semibold tabular-nums text-slate-500">{g.fontSizePx}px</span>
      <button
        type="button"
        onClick={g.resetFont}
        aria-label="Reset font size to default"
        title={`Reset to ${FONT_DEFAULT}px`}
        className="text-slate-500 transition-colors hover:text-slate-300"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
          <polyline points="1 4 1 10 7 10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
