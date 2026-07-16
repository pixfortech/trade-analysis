"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import { num } from "@/lib/format";
import type { Mover } from "@/types/api";

/**
 * Compact top-3 gainers / losers for the RIGHT RAIL — keeps Market Movers out of
 * the main decision workflow. The full table lives on the Movers screen. Live
 * bounded scan; refetches on Kite reconnect. Read-only.
 */
export function MoversSummary({ onOpenFull }: { onOpenFull?: () => void }) {
  const [gainers, setGainers] = useState<Mover[]>([]);
  const [losers, setLosers] = useState<Mover[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const r = await api.topMovers("indices");
      setGainers(r.gainers.slice(0, 3));
      setLosers(r.losers.slice(0, 3));
      setState("idle");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useKiteConnected(() => void load());

  return (
    <div style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border-1)", background: "var(--surface-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 10px", borderBottom: "1px solid var(--border-1)" }}>
        <span className="eyebrow" style={{ color: "var(--ink-1)" }}>Top movers</span>
        {onOpenFull && <button type="button" onClick={onOpenFull} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: "var(--brand-600)", background: "transparent", border: "none", cursor: "pointer" }}>All ›</button>}
      </div>
      <div style={{ padding: 8 }}>
        {state === "error" ? (
          <p style={{ fontSize: 11, color: "var(--ink-3)" }}>Movers need live Kite.</p>
        ) : state === "loading" ? (
          <p style={{ fontSize: 11, color: "var(--ink-3)" }}>Loading…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Col rows={gainers} up />
            <Col rows={losers} up={false} />
          </div>
        )}
      </div>
    </div>
  );
}

function Col({ rows, up }: { rows: Mover[]; up: boolean }) {
  const c = up ? "var(--price-up)" : "var(--price-down)";
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", color: c, marginBottom: 3 }}>{up ? "▲ Gainers" : "▼ Losers"}</div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 10.5, color: "var(--ink-4)" }}>—</p>
      ) : (
        rows.map((m) => (
          <div key={m.instrument} style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 11, padding: "2px 0" }}>
            <span title={m.displayName} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-1)" }}>{m.compactName}</span>
            <span className="num" style={{ color: c, fontWeight: 700, flexShrink: 0 }}>{m.changePercent >= 0 ? "+" : ""}{num(m.changePercent)}%</span>
          </div>
        ))
      )}
    </div>
  );
}
