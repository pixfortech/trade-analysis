"use client";

import { useEffect, useRef } from "react";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/apiClient";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { useTheme } from "@/hooks/useTheme";
import { marketIndices } from "@/lib/mockData";
import { num, signed } from "@/lib/format";
import { InstrumentSearch, type SelectedInstrument } from "@/components/dashboard/InstrumentSearch";
import type { KiteStatus } from "@/types/api";
import { Icon, Switch } from "./ds";

export type Screen = "dashboard" | "positions" | "movers" | "status";

/* ------------------------------ brand mark ------------------------------ */
function Mark() {
  return (
    <svg width={26} height={26} viewBox="0 0 48 48" aria-hidden style={{ display: "block" }}>
      <rect width="48" height="48" rx="12" fill="#0c111d" />
      <rect x="13" y="15" width="4" height="18" rx="1.5" fill="#98a2b3" />
      <rect x="22" y="9" width="4" height="30" rx="1.5" fill="#2bd48f" />
      <rect x="31" y="19" width="4" height="12" rx="1.5" fill="#5b82ee" />
    </svg>
  );
}

/* -------------------------------- top bar -------------------------------- */
export function TopBar({ onNav }: { onNav: (s: Screen) => void }) {
  const g = useGlobalControls();
  const { theme, toggle } = useTheme();
  const kite = useAsync(api.kite.status);

  useEffect(() => {
    void kite.run();
    const id = window.setInterval(() => void kite.run(), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPick = (ins: SelectedInstrument) =>
    g.setSelectedInstrument({ instrument: ins.instrument, displayName: ins.displayName, lotSize: ins.lotSize, quotable: ins.quotable, name: ins.name });

  return (
    <header
      style={{
        height: "var(--bar-height)", background: "var(--surface-terminal)", display: "flex", alignItems: "center",
        gap: 14, padding: "0 14px 0 18px", position: "sticky", top: 0, zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
        <span style={{ display: "inline-flex", width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.06)", alignItems: "center", justifyContent: "center" }}>
          <Mark />
        </span>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, whiteSpace: "nowrap" }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em" }}>Trade Analysis</span>
          <span style={{ color: "#6e93f2", fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em" }}>AI ENGINE</span>
        </div>
      </div>

      {/* live instrument search (real backend search) */}
      <div className="terminal-search" style={{ flex: 1, maxWidth: 460, minWidth: 0, marginLeft: 4 }}>
        <InstrumentSearch onSelect={onPick} placeholder="Search instrument — NIFTY, RELIANCE, options…" />
      </div>

      <div style={{ flex: 1 }} />

      {/* Connect Kite / Kite Connected / Reconnect — always available */}
      <ConnectKite status={kite.data ?? null} error={kite.isError} onRetry={() => void kite.run()} />
      <span style={{ width: 1, height: 24, background: "rgba(255,255,255,.12)" }} className="hide-sm" />
      <Switch checked={g.liveUpdates} onChange={g.toggleLiveUpdates} label="Live updates" />
      <IconBtn label="Toggle theme" onClick={toggle}><Icon n={theme === "dark" ? "sun" : "moon"} size={17} /></IconBtn>
      <IconBtn label="Settings & status" onClick={() => onNav("status")}><Icon n="settings" size={17} /></IconBtn>
      <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--brand-500)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>A</span>
    </header>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "var(--radius-sm)", border: "none", background: "transparent", color: "#c3cbd9", cursor: "pointer", flexShrink: 0 }}>
      {children}
    </button>
  );
}

/**
 * Top-bar Kite connection button — always visible on every screen. Calls the
 * existing backend login-url flow and opens Zerodha's hosted login. Read-only:
 * this only authorises market-data access, never order placement.
 */
function ConnectKite({ status, error, onRetry }: { status: KiteStatus | null; error: boolean; onRetry: () => void }) {
  const login = useAsync(api.kite.loginUrl);
  const wasAuth = useRef(false);
  if (status?.authenticated) wasAuth.current = true;

  const connect = async () => {
    const res = await login.run();
    if (res?.loginUrl) window.open(res.loginUrl, "_blank", "noopener,noreferrer");
  };

  const connected = !!status?.authenticated;
  const expired = !connected && (wasAuth.current || (!!status && /expire|reconnect|again|token|session|invalid/i.test(status.message)));

  let label: string, bg: string, border: string, color: string, dot: string | null, icon: string | null, onClick: () => void;
  if (error) {
    label = "Kite offline"; bg = "rgba(249,112,102,.15)"; border = "rgba(249,112,102,.45)"; color = "#f97066"; dot = null; icon = "refresh"; onClick = onRetry;
  } else if (connected) {
    label = "Kite Connected"; bg = "rgba(18,183,106,.15)"; border = "rgba(18,183,106,.45)"; color = "#2bd48f"; dot = "var(--status-live)"; icon = null; onClick = connect;
  } else if (expired) {
    label = login.isLoading ? "Opening…" : "Reconnect Kite"; bg = "rgba(247,144,9,.16)"; border = "rgba(247,144,9,.45)"; color = "#f7a957"; dot = "var(--status-stale)"; icon = "log-in"; onClick = connect;
  } else {
    label = login.isLoading ? "Opening…" : "Connect Kite"; bg = "var(--brand-500)"; border = "transparent"; color = "#fff"; dot = null; icon = "log-in"; onClick = connect;
  }

  return (
    <button type="button" onClick={onClick} title={label} disabled={login.isLoading}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 30, padding: "0 13px", borderRadius: "var(--radius-pill)", border: `1px solid ${border}`, background: bg, color, fontSize: 12, fontWeight: 700, cursor: login.isLoading ? "default" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
      {connected && dot ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full" style={{ background: dot, opacity: 0.55 }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: dot }} />
        </span>
      ) : dot ? (
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
      ) : icon ? (
        <Icon n={icon} size={14} />
      ) : null}
      {label}
    </button>
  );
}

/* ----------------------------- status strip ------------------------------ */
export function StatusStrip() {
  return (
    <div
      style={{
        height: "var(--status-height)", background: "var(--surface-terminal-2)", display: "flex", alignItems: "center",
        gap: 24, padding: "0 20px", overflowX: "auto", position: "sticky", top: "var(--bar-height)", zIndex: 39,
      }}
    >
      {marketIndices.map((ix) => {
        const down = ix.change < 0;
        return (
          <span key={ix.symbol} style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#8b97ab" }}>{ix.name}</span>
            <span className="num" style={{ fontSize: 12, fontWeight: 700, color: "#f2f5f9" }}>{num(ix.ltp)}</span>
            <span className="num" style={{ fontSize: 11, fontWeight: 700, color: down ? "var(--price-down)" : "var(--price-up)" }}>
              {down ? "▼" : "▲"} {signed(ix.change)}
            </span>
          </span>
        );
      })}
      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#5d6b82", whiteSpace: "nowrap" }} className="hide-sm">
        NSE · read-only · indices sample
      </span>
    </div>
  );
}

/* ------------------------------- nav rail -------------------------------- */
const NAV: { id: Screen; icon: string; label: string }[] = [
  { id: "dashboard", icon: "dashboard", label: "Cockpit" },
  { id: "positions", icon: "briefcase", label: "Positions" },
  { id: "movers", icon: "activity", label: "Movers" },
  { id: "status", icon: "gauge", label: "Status" },
];

export function NavRail({ active, onNav, stripVisible = true }: { active: Screen; onNav: (s: Screen) => void; stripVisible?: boolean }) {
  const offset = stripVisible ? "calc(var(--bar-height) + var(--status-height))" : "var(--bar-height)";
  return (
    <nav
      style={{
        width: 64, flexShrink: 0, background: "var(--surface-card)", borderRight: "1px solid var(--border-1)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 0",
        position: "sticky", top: offset,
        height: `calc(100vh - ${stripVisible ? "var(--bar-height) - var(--status-height)" : "var(--bar-height)"})`, zIndex: 20,
      }}
    >
      {NAV.map((it) => {
        const on = active === it.id;
        return (
          <button key={it.id} onClick={() => onNav(it.id)} title={it.label} aria-label={it.label}
            style={{
              position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 50, padding: "8px 0",
              border: "none", cursor: "pointer", borderRadius: "var(--radius-md)",
              background: on ? "var(--brand-100)" : "transparent", color: on ? "var(--brand-600)" : "var(--ink-3)",
            }}
          >
            <span style={{ position: "absolute", left: -7, top: 10, bottom: 10, width: 3, borderRadius: 2, background: "var(--brand-500)", opacity: on ? 1 : 0 }} />
            <Icon n={it.icon} size={20} />
            <span style={{ fontSize: 9, fontWeight: on ? 800 : 700, letterSpacing: "0.02em" }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
