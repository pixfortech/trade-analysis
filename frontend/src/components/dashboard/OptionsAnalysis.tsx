"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DsCard, DsBadge, Icon } from "@/components/terminal/ds";
import { api } from "@/lib/apiClient";
import { compact, num } from "@/lib/format";
import { fmtMarketTime } from "@/lib/marketTime";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useKiteConnected } from "@/hooks/useKiteConnected";
import type { OptionRow, OptionSide, OptionsChainResponse } from "@/types/api";

const INDEX_UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX"];
const STRIKE_CHOICES = [8, 12, 16, 24];

/**
 * LIVE Options Chain — READ-ONLY. Built from the Kite instrument catalogue +
 * batched live quotes (no sample data). Underlying/expiry/strikes selectors,
 * live spot/PCR/max-pain/support/resistance derived from real OI, freshness
 * timestamps, and instrument-change race protection. Connect Kite → Connect state.
 */
export function OptionsAnalysis() {
  const g = useGlobalControls();
  const cfg = usePublicConfig();
  const tz = cfg.session.timezone;
  const derived = (g.selectedInstrument?.name || "").toUpperCase().replace(/\s+/g, "");
  const initialUnderlying = INDEX_UNDERLYINGS.includes(derived) ? derived : "NIFTY";

  const [underlying, setUnderlying] = useState(initialUnderlying);
  const [expiry, setExpiry] = useState<string>("");
  const [strikes, setStrikes] = useState(12);
  const [chain, setChain] = useState<OptionsChainResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const reqId = useRef(0);

  // Fetch the chain for the CURRENT selection; ignore stale responses.
  const loadChain = useCallback(async (u: string, e: string, s: number) => {
    const myId = ++reqId.current;
    try {
      const res = await api.optionsChain({ underlying: u, expiry: e || undefined, strikes: s });
      if (myId !== reqId.current) return;
      setChain(res);
      if (!e && res.expiry) setExpiry(res.expiry);
      setRefreshedAt(Date.now());
      setStatus("idle");
      setErr(null);
    } catch (ex) {
      if (myId !== reqId.current) return;
      setErr(ex instanceof Error ? ex.message : "Options chain unavailable.");
      setStatus("error");
    }
  }, []);

  // Underlying change → clear old chain immediately + reset expiry, then reload.
  useEffect(() => {
    reqId.current++;
    setChain(null);
    setExpiry("");
    setStatus("loading");
    setErr(null);
    void loadChain(underlying, "", strikes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying]);

  // Expiry / strikes change → reload (keeps underlying).
  useEffect(() => {
    if (!expiry) return;
    setStatus("loading");
    void loadChain(underlying, expiry, strikes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiry, strikes]);

  // Live polling (paused when global Live is OFF) + refetch on reconnect.
  useEffect(() => {
    if (!g.liveUpdates) return;
    const id = window.setInterval(() => void loadChain(underlying, expiry, strikes), cfg.refresh.intelligenceMs);
    return () => window.clearInterval(id);
  }, [g.liveUpdates, underlying, expiry, strikes, loadChain, cfg.refresh.intelligenceMs]);
  useKiteConnected(() => { setStatus("loading"); void loadChain(underlying, expiry, strikes); });

  const m = chain?.metrics;
  const incomplete = m ? m.completeness < 0.5 : false;

  return (
    <DsCard
      eyebrow="Options chain"
      title={`${underlying}${chain?.expiry ? ` · ${chain.expiry}` : ""}`}
      headerRight={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {chain?.spot.value != null && <DsBadge tone="brand" dot>Spot {num(chain.spot.value, chain.spot.value > 1000 ? 0 : 2)}</DsBadge>}
          <span style={{ fontSize: 10, color: "var(--ink-4)" }}>{refreshedAt ? fmtMarketTime(refreshedAt, tz) : g.liveUpdates ? "…" : "paused"}</span>
          <button type="button" onClick={() => void loadChain(underlying, expiry, strikes)} title="Refresh" aria-label="Refresh" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", cursor: "pointer" }}><Icon n="refresh" size={13} /></button>
        </span>
      }
    >
      {/* selectors */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <Sel label="Underlying" value={underlying} onChange={setUnderlying} options={[...new Set([initialUnderlying, ...INDEX_UNDERLYINGS])].map((u) => ({ value: u, label: u }))} />
        <Sel label="Expiry" value={expiry} onChange={setExpiry} options={(chain?.expiries ?? []).map((e) => ({ value: e, label: e }))} disabled={!chain?.expiries.length} />
        <Sel label="Strikes" value={String(strikes)} onChange={(v) => setStrikes(Number(v))} options={STRIKE_CHOICES.map((n) => ({ value: String(n), label: `±${n}` }))} />
      </div>

      {status === "error" && !chain ? (
        <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--action-avoid-border)", background: "var(--action-avoid-soft)", padding: "12px 14px", textAlign: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--action-avoid)" }}>Connect Kite to load live option data</p>
          <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{err}</p>
        </div>
      ) : status === "loading" && !chain ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 22, borderRadius: 6, background: "var(--surface-sunken)" }} />)}</div>
      ) : chain ? (
        <>
          {/* analytics rail — all derived from the CURRENT loaded chain OI */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
            <Stat label="PCR (OI · this expiry)" value={m?.pcr != null ? m.pcr.toFixed(2) : "—"} tone={m?.pcr != null ? (m.pcr < 1 ? "enter" : "exit") : "none"} />
            <Stat label="Max pain" value={m?.maxPain != null ? num(m.maxPain, 0) : "—"} title="Strike minimising option-buyer payout at expiry (estimate from loaded OI)" />
            <Stat label="Support (max PE OI)" value={m?.support != null ? num(m.support, 0) : "—"} tone="enter" />
            <Stat label="Resistance (max CE OI)" value={m?.resistance != null ? num(m.resistance, 0) : "—"} tone="exit" />
            <Stat label="ATM" value={m?.atm != null ? num(m.atm, 0) : "—"} />
          </div>
          {incomplete && <p style={{ fontSize: 10.5, color: "var(--action-avoid)", marginBottom: 8 }}>⚠ Partial OI — PCR / max-pain use only strikes with OI ({Math.round((m?.completeness ?? 0) * 100)}% complete).</p>}
          {chain.rows.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>{chain.message}</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ color: "var(--ink-4)" }}>
                    <Th colSpan={4} tone="enter">CALLS</Th>
                    <Th>Strike</Th>
                    <Th colSpan={4} tone="exit">PUTS</Th>
                  </tr>
                  <tr style={{ color: "var(--ink-4)", fontSize: 9 }}>
                    <Th>OI</Th><Th>Vol</Th><Th>Chg%</Th><Th>LTP</Th>
                    <Th> </Th>
                    <Th>LTP</Th><Th>Chg%</Th><Th>Vol</Th><Th>OI</Th>
                  </tr>
                </thead>
                <tbody>
                  {chain.rows.map((r) => <Row key={r.strike} r={r} />)}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 8 }}>{chain.message} · spot {chain.spot.source === "exchange" ? `exchange ${fmtMarketTime(chain.spot.ms, tz) ?? ""}` : chain.spot.source === "receipt" ? "receipt time" : "n/a"} · read-only, no order placement.</p>
        </>
      ) : null}
    </DsCard>
  );
}

function Row({ r }: { r: OptionRow }) {
  const bg = r.isATM ? "var(--brand-50)" : "transparent";
  return (
    <tr style={{ background: bg, borderTop: "1px solid var(--border-1)" }}>
      <Cell v={r.ce.oi} fmt={compact} />
      <Cell v={r.ce.volume} fmt={compact} />
      <ChgCell v={r.ce.changePercent} />
      <Cell v={r.ce.ltp} strong />
      <td style={{ textAlign: "center", padding: "3px 6px", fontWeight: 800, color: r.isATM ? "var(--brand-600)" : "var(--ink-1)", whiteSpace: "nowrap" }}>{num(r.strike, 0)}{r.isATM ? " ·ATM" : ""}</td>
      <Cell v={r.pe.ltp} strong />
      <ChgCell v={r.pe.changePercent} />
      <Cell v={r.pe.volume} fmt={compact} />
      <Cell v={r.pe.oi} fmt={compact} />
    </tr>
  );
}
function Cell({ v, fmt, strong }: { v: number | null; fmt?: (n: number) => string; strong?: boolean }) {
  return <td style={{ textAlign: "right", padding: "3px 6px", color: strong ? "var(--ink-1)" : "var(--ink-3)", fontWeight: strong ? 700 : 400, whiteSpace: "nowrap" }} className="num">{v == null ? "—" : fmt ? fmt(v) : num(v)}</td>;
}
function ChgCell({ v }: { v: number | null }) {
  return <td style={{ textAlign: "right", padding: "3px 6px", fontWeight: 700, color: v == null ? "var(--ink-4)" : v >= 0 ? "var(--price-up)" : "var(--price-down)", whiteSpace: "nowrap" }} className="num">{v == null ? "—" : `${v >= 0 ? "+" : ""}${v}%`}</td>;
}
function Th({ children, colSpan, tone }: { children: React.ReactNode; colSpan?: number; tone?: "enter" | "exit" }) {
  return <th colSpan={colSpan} style={{ padding: "3px 6px", textAlign: colSpan && colSpan > 1 ? "center" : "right", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: tone === "enter" ? "var(--action-enter)" : tone === "exit" ? "var(--action-exit)" : "var(--ink-4)" }}>{children}</th>;
}
function Sel({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span className="eyebrow" style={{ fontSize: 8.5 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ height: 30, padding: "0 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-1)", fontSize: 12, cursor: disabled ? "not-allowed" : "pointer" }}>
        {options.length === 0 ? <option value="">—</option> : options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Stat({ label, value, tone, title }: { label: string; value: string; tone?: "enter" | "exit" | "none"; title?: string }) {
  const c = tone === "enter" ? "var(--action-enter)" : tone === "exit" ? "var(--action-exit)" : "var(--ink-1)";
  return (
    <div title={title} style={{ minWidth: 0 }}>
      <div className="eyebrow" style={{ fontSize: 8.5 }}>{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 800, color: c }}>{value}</div>
    </div>
  );
}
