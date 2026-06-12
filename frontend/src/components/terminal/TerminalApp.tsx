"use client";

import { useState, type ReactNode } from "react";
import { TopBar, StatusStrip, NavRail, type Screen } from "./Chrome";
import { Icon } from "./ds";
import { LiveMarketSignal } from "@/components/dashboard/LiveMarketSignal";
import { TopPerformersCard } from "@/components/dashboard/TopPerformersCard";
import { LiveWatchlist } from "@/components/dashboard/LiveWatchlist";
import { RiskManagementCard } from "@/components/dashboard/RiskManagementCard";
import { PaperTradingPanel } from "@/components/dashboard/PaperTradingPanel";
import { ActiveTradeMonitorCard } from "@/components/dashboard/ActiveTradeMonitorCard";
import { AccountSummaryCard } from "@/components/dashboard/AccountSummaryCard";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { FuturesAnalysis } from "@/components/dashboard/FuturesAnalysis";
import { OptionsAnalysis } from "@/components/dashboard/OptionsAnalysis";
import { KiteStatusCard } from "@/components/dashboard/KiteStatusCard";
import { MarketStatusCard } from "@/components/dashboard/MarketStatusCard";
import { GlobalControlBar } from "@/components/layout/GlobalControlBar";
import { FloatingAssistants } from "@/components/dashboard/FloatingAssistants";

/**
 * Terminal cockpit shell. A dark control bar + indices status strip + left nav
 * rail wrap an opinionated, screen-switched layout. The Dashboard is a two-column
 * cockpit (Live Market Signal hero + Watchlist / Risk / Paper rail). All
 * production logic lives inside the reused feature components — this file only
 * composes them. Read-only throughout.
 */
export function TerminalApp() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-app)" }}>
      <TopBar onNav={setScreen} />
      <StatusStrip />
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <NavRail active={screen} onNav={setScreen} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <main className="cockpit-main" style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
            {screen === "dashboard" && <DashboardScreen />}
            {screen === "positions" && (
              <ScreenShell title="AI virtual trade & positions" sub="Track manual and engine-managed positions against the live signal" onBack={() => setScreen("dashboard")}>
                <ActiveTradeMonitorCard />
                <TwoCol>
                  <PaperTradingPanel />
                  <AccountSummaryCard />
                </TwoCol>
              </ScreenShell>
            )}
            {screen === "movers" && (
              <ScreenShell title="Movers, indices & breadth" sub="Where the market is moving right now" onBack={() => setScreen("dashboard")}>
                <TopPerformersCard />
                <MarketOverview />
                <TwoCol>
                  <FuturesAnalysis />
                  <OptionsAnalysis />
                </TwoCol>
              </ScreenShell>
            )}
            {screen === "status" && (
              <ScreenShell title="Status, data & controls" sub="Kite connection, market session, account and live-monitoring controls" onBack={() => setScreen("dashboard")}>
                <GlobalControlBar />
                <TwoCol>
                  <KiteStatusCard />
                  <MarketStatusCard />
                </TwoCol>
                <AccountSummaryCard />
              </ScreenShell>
            )}
          </main>
        </div>
      </div>

      {/* Floating AI Trade Assistant windows — opened on demand from the Watchlist. */}
      <FloatingAssistants />
    </div>
  );
}

/* ----------------------------- dashboard screen -------------------------- */
function DashboardScreen() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: "var(--space-5)" }}>
        <div>
          <p className="eyebrow">Cockpit · live read-only</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink-1)" }}>Live Market Signal</h1>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: "var(--radius-pill)", background: "var(--action-enter-soft)", border: "1px solid var(--action-enter-border)", color: "var(--action-enter)", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-live)" }} />
          Advisory · no order execution
        </span>
      </div>

      <div className="cockpit-grid">
        {/* Wide content column — hero signal + the dense, width-hungry cards. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", minWidth: 0 }}>
          <LiveMarketSignal />
          <RiskManagementCard />
          <div className="cockpit-twocol">
            <TopPerformersCard />
            <PaperTradingPanel />
          </div>
        </div>
        {/* Watchlist rail — the classic terminal sidebar. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", minWidth: 0 }}>
          <LiveWatchlist />
        </div>
      </div>

      <footer style={{ marginTop: "var(--space-10, 40px)", borderTop: "1px solid var(--border-1)", paddingTop: "var(--space-6)", textAlign: "center", fontSize: 12, lineHeight: 1.6, color: "var(--ink-3)" }}>
        <p>AI Share Market Analysis Tool · Live read-only market data via Zerodha Kite. Advisory analysis only — for decision support, with no automatic trade execution.</p>
        <p style={{ marginTop: 6 }}>⚠️ Not investment advice. No order placement, modification or trade execution. Trading in equities, futures &amp; options involves substantial risk of loss.</p>
      </footer>
    </>
  );
}

/* ------------------------------ screen shell ----------------------------- */
function ScreenShell({ title, sub, onBack, children }: { title: string; sub: string; onBack: () => void; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} aria-label="Back to cockpit" type="button"
          style={{ width: 34, height: 34, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-2)", background: "var(--surface-card)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)", flexShrink: 0 }}>
          <Icon n="dashboard" size={16} />
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink-1)" }}>{title}</h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 1 }}>{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="cockpit-twocol">{children}</div>;
}
