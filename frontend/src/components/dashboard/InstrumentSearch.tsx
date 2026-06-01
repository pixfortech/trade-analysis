"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import type { InstrumentResult, SearchResponse, UiSegment } from "@/types/api";

export type SelectedInstrument = InstrumentResult;

const GROUP_LABEL: Record<UiSegment, string> = {
  equity: "Equity",
  indices: "Indices",
  futures: "Futures",
  options: "Options",
};
const GROUP_ORDER: UiSegment[] = ["equity", "indices", "futures", "options"];

/**
 * Reusable Zerodha-like instrument search (Phase 3D). Debounced, grouped
 * results (Equity / Indices / Futures / Options). READ-ONLY — selecting an
 * item just returns the resolved symbol + token to the parent. No order UI.
 */
export function InstrumentSearch({
  onSelect,
  placeholder = "Search e.g. RELIANCE, NIFTY, MIDCPNIFTY FUT, NIFTY 24500 CE",
  autoFocus = false,
}: {
  onSelect: (ins: SelectedInstrument) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Debounced search.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setData(null);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const t = setTimeout(async () => {
      try {
        const res = await api.kite.instrumentsSearch({ q: query, limit: 8 });
        setData(res);
        setStatus("idle");
        setOpen(true);
        setActiveIndex(-1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed.");
        setStatus("error");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Flatten groups for keyboard navigation, preserving group order.
  const flat: InstrumentResult[] = [];
  if (data) for (const g of GROUP_ORDER) flat.push(...data.groups[g]);

  const choose = (ins: InstrumentResult) => {
    onSelect(ins);
    setOpen(false);
    setQ("");
    setData(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      choose(flat[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const total = flat.length;
  let runningIndex = -1;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={q}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => data && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search instruments"
          aria-expanded={open}
          aria-controls={listboxId}
          role="combobox"
          className="w-full rounded-xl border border-white/10 bg-base-800/70 py-3 pl-10 pr-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
        {status === "loading" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">Searching…</span>
        )}
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-96 w-full overflow-auto rounded-xl border border-white/10 bg-base-850 shadow-card"
        >
          {status === "error" && (
            <p className="px-4 py-3 text-sm text-bear">
              {error} — make sure the instruments cache is refreshed (Live Data card → Refresh).
            </p>
          )}
          {status !== "error" && total === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400">
              {data?.message || "No matches. Refine your search or refresh the instruments cache."}
            </p>
          )}
          {GROUP_ORDER.map((g) => {
            const items = data?.groups[g] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={g}>
                <p className="sticky top-0 bg-base-900/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {GROUP_LABEL[g]}
                </p>
                {items.map((ins) => {
                  runningIndex++;
                  const idx = runningIndex;
                  return (
                    <button
                      key={ins.instrument + ins.strike}
                      type="button"
                      role="option"
                      aria-selected={idx === activeIndex}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => choose(ins)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                        idx === activeIndex ? "bg-accent/10" : "hover:bg-white/5"
                      }`}
                    >
                      <span>
                        <span className="block text-[15px] font-medium text-slate-100">{ins.displayName}</span>
                        <span className="num block text-xs text-slate-500">{ins.instrument}</span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-slate-500">
                        <span className="rounded border border-white/10 px-1.5 py-0.5">{ins.exchange}</span>
                        {ins.lotSize ? <span className="ml-1">lot {num(ins.lotSize, 0)}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
