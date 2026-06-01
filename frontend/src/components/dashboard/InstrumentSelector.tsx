"use client";

import { useState } from "react";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { num } from "@/lib/format";
import type { InstrumentCandidate } from "@/types/api";

export type SegmentMode = "EQ" | "FUT" | "OPT";

/** What the parent receives once an instrument is resolved. */
export interface ResolvedSelection {
  instrument: string; // EXCHANGE:TRADINGSYMBOL
  instrumentToken: number | null;
  lotSize: number | null;
  label: string;
}

/**
 * Read-only instrument selector for Equity / Futures / Options.
 * Resolves user-friendly inputs to an exact Kite symbol via the backend
 * resolver (which uses the official instruments dump). No order controls.
 */
export function InstrumentSelector({ onResolved }: { onResolved: (sel: ResolvedSelection) => void }) {
  const [mode, setMode] = useState<SegmentMode>("EQ");
  const [underlying, setUnderlying] = useState("RELIANCE");
  const [expiry, setExpiry] = useState("");
  const [strike, setStrike] = useState("");
  const [optionType, setOptionType] = useState<"CE" | "PE">("CE");

  const resolve = useAsync(api.kite.instrumentsResolve);

  const onResolve = async () => {
    if (mode === "EQ") {
      // Equity: build NSE:SYMBOL directly (no dump round-trip needed).
      const sym = underlying.trim().toUpperCase();
      if (!sym) return;
      const instrument = sym.includes(":") ? sym : `NSE:${sym}`;
      onResolved({ instrument, instrumentToken: null, lotSize: null, label: instrument });
      resolve.reset();
      return;
    }
    const res = await resolve.run({
      underlying: underlying.trim(),
      segment: "NFO",
      instrumentType: mode === "FUT" ? "FUT" : optionType,
      expiry: expiry.trim() || undefined,
      strike: mode === "OPT" && strike.trim() ? Number(strike) : undefined,
      optionType: mode === "OPT" ? optionType : undefined,
    });
    if (res?.resolved) {
      const r = res.resolved;
      onResolved({
        instrument: r.instrument,
        instrumentToken: r.instrumentToken,
        lotSize: r.lotSize,
        label: `${r.instrument} (${r.name})`,
      });
    }
  };

  const pickCandidate = (c: InstrumentCandidate) => {
    onResolved({ instrument: c.instrument, instrumentToken: c.instrumentToken, lotSize: c.lotSize, label: `${c.instrument} (${c.name})` });
  };

  return (
    <div className="rounded-lg border border-white/5 bg-base-800/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-300">Instrument selector</p>
        <div className="flex gap-1 rounded-lg border border-white/5 bg-base-900/60 p-0.5">
          {(["EQ", "FUT", "OPT"] as SegmentMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === m ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "EQ" ? "Equity" : m === "FUT" ? "Futures" : "Options"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          value={underlying}
          onChange={(e) => setUnderlying(e.target.value)}
          placeholder={mode === "EQ" ? "RELIANCE" : "MIDCPNIFTY"}
          aria-label="Underlying"
          className="rounded-lg border border-white/5 bg-base-900/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
        />
        {mode !== "EQ" && (
          <input
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            placeholder="expiry YYYY-MM or YYYY-MM-DD"
            aria-label="Expiry"
            className="rounded-lg border border-white/5 bg-base-900/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
          />
        )}
        {mode === "OPT" && (
          <>
            <input
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
              placeholder="strike e.g. 24500"
              inputMode="numeric"
              aria-label="Strike"
              className="rounded-lg border border-white/5 bg-base-900/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
            />
            <select
              value={optionType}
              onChange={(e) => setOptionType(e.target.value as "CE" | "PE")}
              aria-label="Option type"
              className="rounded-lg border border-white/5 bg-base-900/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
            >
              <option value="CE">CE (Call)</option>
              <option value="PE">PE (Put)</option>
            </select>
          </>
        )}
        <button
          type="button"
          onClick={onResolve}
          disabled={resolve.isLoading || !underlying.trim()}
          className="rounded-lg border border-white/10 bg-base-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-base-700 disabled:opacity-40"
        >
          {resolve.isLoading ? "Resolving…" : mode === "EQ" ? "Use symbol" : "Resolve"}
        </button>
      </div>

      {mode !== "EQ" && (
        <p className="mt-2 text-[11px] text-slate-500">
          F&amp;O contracts resolve via Kite&apos;s official instruments dump (exchange NFO). Leave expiry blank for
          the nearest contract.
        </p>
      )}

      {/* Resolver feedback */}
      {resolve.isError && <p className="mt-2 text-xs text-bear">{resolve.error}</p>}
      {resolve.isSuccess && resolve.data && !resolve.data.resolved && (
        <div className="mt-2">
          <p className="text-xs text-neutralSignal">{resolve.data.message}</p>
          {resolve.data.candidates.length > 0 && (
            <div className="mt-2 max-h-40 overflow-auto rounded-md border border-white/5">
              {resolve.data.candidates.map((c) => (
                <button
                  key={c.instrument + c.strike}
                  type="button"
                  onClick={() => pickCandidate(c)}
                  className="flex w-full items-center justify-between gap-2 border-b border-white/5 px-2 py-1.5 text-left text-[11px] text-slate-300 last:border-0 hover:bg-white/5"
                >
                  <span className="num">{c.instrument}</span>
                  <span className="text-slate-500">
                    {c.expiry}
                    {c.strike ? ` · ${num(c.strike, 0)} ${c.instrumentType}` : ""} · lot {c.lotSize}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
