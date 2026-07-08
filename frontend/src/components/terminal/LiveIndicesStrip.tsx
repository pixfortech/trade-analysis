"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import { api } from "@/lib/apiClient";
import { numFlex, tsec } from "@/lib/format";
import { InstrumentSearch, type SelectedInstrument } from "@/components/dashboard/InstrumentSearch";
import { Icon } from "./ds";

interface StripItem {
  instrument: string;
  displayName: string;
}

// Live, user-editable indices. Defaults come from the public runtime config
// (usePublicConfig → /api/config/public, env-overridable) — shown only when Kite
// can actually quote them (else flagged unavailable).
const KEY = "cockpit.indices.v1";

interface Quote { ltp: number; changePercent: number | null }

/** Live Kite-backed, editable indices strip (replaces the old static sample). */
export function StatusStrip() {
  const g = useGlobalControls();
  const cfg = usePublicConfig();
  const { value: items, setValue: setItems, hydrated } = useLocalStorage<StripItem[]>(KEY, cfg.defaults.topStripSymbols);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const refresh = useCallback(async () => {
    const list = itemsRef.current;
    if (list.length === 0) { setQuotes({}); setMissing(new Set()); return; }
    try {
      const res = await api.kite.quotes(list.map((i) => i.instrument));
      const next: Record<string, Quote> = {};
      for (const [k, q] of Object.entries(res.data)) {
        const ltp = typeof q.last_price === "number" ? q.last_price : 0;
        const close = q.ohlc?.close;
        const cp = typeof close === "number" && close > 0 ? ((ltp - close) / close) * 100 : null;
        if (ltp > 0) next[k] = { ltp, changePercent: cp };
      }
      setQuotes(next);
      setMissing(new Set(list.map((i) => i.instrument).filter((k) => !(k in next))));
      setRefreshedAt(Date.now());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  // Initial + on list change.
  useEffect(() => { if (hydrated) void refresh(); }, [hydrated, items, refresh]);
  // Auto-refresh ONLY while the global Live toggle is on (manual refresh always works).
  useEffect(() => {
    if (!hydrated || !g.liveUpdates) return;
    const id = window.setInterval(() => void refresh(), cfg.refresh.topStripMs);
    return () => window.clearInterval(id);
  }, [hydrated, g.liveUpdates, refresh, cfg.refresh.topStripMs]);
  // Kite just connected → refetch quotes immediately (clears the awaiting state).
  useKiteConnected(() => void refresh());

  const add = (ins: SelectedInstrument) =>
    setItems((cur) => (cur.some((i) => i.instrument === ins.instrument) ? cur : [...cur, { instrument: ins.instrument, displayName: ins.displayName }]));
  const remove = (instrument: string) => setItems((cur) => cur.filter((i) => i.instrument !== instrument));
  const move = (instrument: string, dir: -1 | 1) =>
    setItems((cur) => {
      const idx = cur.findIndex((i) => i.instrument === instrument);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= cur.length) return cur;
      const copy = [...cur];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });

  return (
    <div style={{ position: "sticky", top: "var(--bar-height)", zIndex: 39 }}>
      <div style={{ height: "var(--status-height)", background: "var(--surface-terminal-2)", display: "flex", alignItems: "center", gap: 22, padding: "0 14px 0 20px", overflowX: "auto" }}>
        {items.length === 0 ? (
          <span style={{ fontSize: 11, color: "#5d6b82" }}>No indices — use Edit to add.</span>
        ) : (
          items.map((it) => {
            const q = quotes[it.instrument];
            const down = q?.changePercent != null && q.changePercent < 0;
            return (
              <span key={it.instrument} style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#8b97ab" }}>{it.displayName}</span>
                {q ? (
                  <>
                    <span className="num" style={{ fontSize: 12, fontWeight: 700, color: "#f2f5f9" }}>{numFlex(q.ltp)}</span>
                    {q.changePercent != null && (
                      <span className="num" style={{ fontSize: 11, fontWeight: 700, color: down ? "var(--price-down)" : "var(--price-up)" }}>
                        {down ? "▼" : "▲"} {Math.abs(q.changePercent).toFixed(2)}%
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7a4708", border: "1px solid #7a4708", borderRadius: 3, padding: "0 4px" }} title={missing.has(it.instrument) ? "Not quotable via Kite (reference-only or unsupported)" : "Awaiting live quote"}>
                    {missing.has(it.instrument) ? "n/a" : "…"}
                  </span>
                )}
              </span>
            );
          })
        )}

        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span className="hide-sm" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#5d6b82", whiteSpace: "nowrap" }}>
            {err ? "live unavailable" : refreshedAt ? `refreshed ${tsec(refreshedAt)}` : "loading…"} · {g.liveUpdates ? "live" : "paused"}
          </span>
          <button type="button" onClick={() => void refresh()} title="Refresh now" aria-label="Refresh indices" style={barBtn}><Icon n="refresh" size={13} /></button>
          <button type="button" onClick={() => setEditing((v) => !v)} title="Edit indices" style={{ ...barBtn, width: "auto", gap: 5, padding: "0 8px", color: editing ? "#6e93f2" : "#c3cbd9" }}>
            <Icon n="pencil" size={12} /><span className="hide-sm" style={{ fontSize: 11, fontWeight: 700 }}>Edit</span>
          </button>
        </span>
      </div>

      {editing && (
        <>
          <div onClick={() => setEditing(false)} style={{ position: "fixed", inset: 0, zIndex: 41 }} />
          <div style={{ position: "absolute", right: 14, top: "calc(var(--status-height) + 4px)", zIndex: 42, width: 340, maxWidth: "calc(100vw - 28px)", background: "var(--surface-raised)", border: "1px solid var(--border-1)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-float)", padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span className="eyebrow">Edit indices strip</span>
              <button type="button" onClick={() => setItems(cfg.defaults.topStripSymbols)} style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", background: "transparent", border: "none", cursor: "pointer" }}>Reset</button>
            </div>
            <InstrumentSearch onSelect={add} placeholder="Add index / instrument…" />
            <div style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
              {items.map((it, idx) => (
                <div key={it.instrument} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: "1px solid var(--border-1)" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.displayName}</span>
                    <span className="num" style={{ display: "block", fontSize: 10, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.instrument}{missing.has(it.instrument) ? " · not quotable" : ""}</span>
                  </span>
                  <button type="button" onClick={() => move(it.instrument, -1)} disabled={idx === 0} title="Move up" style={{ ...editBtn, opacity: idx === 0 ? 0.35 : 1 }}><Icon n="chevron-up" size={14} /></button>
                  <button type="button" onClick={() => move(it.instrument, 1)} disabled={idx === items.length - 1} title="Move down" style={{ ...editBtn, opacity: idx === items.length - 1 ? 0.35 : 1 }}><Icon n="chevron-down" size={14} /></button>
                  <button type="button" onClick={() => remove(it.instrument)} title="Remove" style={{ ...editBtn, color: "var(--action-exit)" }}><Icon n="x" size={14} /></button>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 8 }}>Live Kite quotes. Non-quotable items (GIFT / NSEIX / BSEIX references) show <strong>n/a</strong>. Saved on this device.</p>
          </div>
        </>
      )}
    </div>
  );
}

const barBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 24, borderRadius: "var(--radius-sm)", border: "none", background: "transparent", color: "#c3cbd9", cursor: "pointer", flexShrink: 0 };
const editBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", cursor: "pointer", flexShrink: 0 };
