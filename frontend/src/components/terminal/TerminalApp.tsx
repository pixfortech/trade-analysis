"use client";

import { useState, type ReactNode } from "react";
import { TopBar, NavRail, type Screen } from "./Chrome";
import { StatusStrip } from "./LiveIndicesStrip";
import { DsCard, Icon, Switch } from "./ds";
import { useModules, MODULES } from "@/hooks/useModules";
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
 * Terminal cockpit shell — dark control bar + indices status strip + left nav
 * rail wrapping a screen-switched layout. The Dashboard follows the design's
 * two-column cockpit (Live Market Signal + Movers on the left, Watchlist / Risk
 * / Paper rail). Every module is user-toggleable (Settings → Modules); hidden
 * modules don't render. All production logic lives in the reused components.
 */
export function TerminalApp() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const { isOn } = useModules();
  const stripVisible = isOn("indicesBreadth");

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-app)" }}>
      <TopBar onNav={setScreen} />
      {stripVisible && <StatusStrip />}
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <NavRail active={screen} onNav={setScreen} stripVisible={stripVisible} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <main className="cockpit-main" style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
            {screen === "dashboard" && <DashboardScreen onNav={setScreen} />}
            {screen === "positions" && (
              <ScreenShell title="AI virtual trade & positions" sub="Manual and engine-managed positions against the live signal" onBack={() => setScreen("dashboard")}>
                {isOn("positionManager") && <ActiveTradeMonitorCard />}
                <TwoCol>
                  {isOn("paperTrade") && <PaperTradingPanel />}
                  {isOn("accountSummary") && <AccountSummaryCard />}
                </TwoCol>
                {!isOn("positionManager") && !isOn("paperTrade") && !isOn("accountSummary") && <Hidden onNav={setScreen} />}
              </ScreenShell>
            )}
            {screen === "movers" && (
              <ScreenShell title="Movers, indices & breadth" sub="Where the market is moving right now" onBack={() => setScreen("dashboard")}>
                {isOn("marketMovers") && <TopPerformersCard />}
                {isOn("indicesBreadth") && <MarketOverview />}
                <TwoCol>
                  {isOn("futures") && <FuturesAnalysis />}
                  {isOn("optionsChain") && <OptionsAnalysis />}
                </TwoCol>
                {!isOn("marketMovers") && !isOn("indicesBreadth") && !isOn("futures") && !isOn("optionsChain") && <Hidden onNav={setScreen} />}
              </ScreenShell>
            )}
            {screen === "status" && (
              <ScreenShell title="Settings, modules & status" sub="Show/hide cockpit modules, Kite connection, session and account" onBack={() => setScreen("dashboard")}>
                <ModulesPanel />
                {isOn("globalControls") && <GlobalControlBar />}
                <TwoCol>
                  {isOn("kiteStatus") && <KiteStatusCard />}
                  <MarketStatusCard />
                </TwoCol>
                {isOn("accountSummary") && <AccountSummaryCard />}
              </ScreenShell>
            )}
          </main>
        </div>
      </div>

      {/* Floating AI Trade Assistant windows — opened on demand from the Watchlist. */}
      {isOn("floatingAssistants") && <FloatingAssistants />}
    </div>
  );
}

/* ----------------------------- dashboard screen -------------------------- */
function DashboardScreen({ onNav }: { onNav: (s: Screen) => void }) {
  const { isOn } = useModules();
  const signalOn = isOn("liveSignal");
  const leftHas = signalOn || isOn("marketMovers");
  const railHas = isOn("watchlist") || isOn("riskPlanner") || isOn("paperTrade");

  const left = (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", minWidth: 0 }}>
      {signalOn && <LiveMarketSignal />}
      {isOn("marketMovers") && <TopPerformersCard />}
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: "var(--space-5)" }}>
        <div>
          <p className="eyebrow">Cockpit · live read-only</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink-1)" }}>{signalOn ? "Live Market Signal" : "Trading cockpit"}</h1>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 11px", borderRadius: "var(--radius-pill)", background: "var(--action-enter-soft)", border: "1px solid var(--action-enter-border)", color: "var(--action-enter)", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--status-live)" }} />
          Advisory · no order execution
        </span>
      </div>

      {!leftHas && !railHas ? (
        <Hidden onNav={onNav} />
      ) : railHas ? (
        <div className="cockpit-grid">
          {left}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", minWidth: 0 }}>
            {isOn("watchlist") && <LiveWatchlist />}
            {isOn("riskPlanner") && <RiskManagementCard />}
            {isOn("paperTrade") && <PaperTradingPanel />}
          </div>
        </div>
      ) : (
        left
      )}

      <footer style={{ marginTop: 40, borderTop: "1px solid var(--border-1)", paddingTop: "var(--space-6)", textAlign: "center", fontSize: 12, lineHeight: 1.6, color: "var(--ink-3)" }}>
        <p>AI Share Market Analysis Tool · Live read-only market data via Zerodha Kite. Advisory analysis only — no automatic trade execution.</p>
        <p style={{ marginTop: 6 }}>⚠️ Not investment advice. No order placement, modification or execution. Trading in equities, futures &amp; options involves substantial risk of loss.</p>
      </footer>
    </>
  );
}

/* ------------------------------ modules panel ---------------------------- */
function ModulesPanel() {
  const { isOn, setModule, reset } = useModules();
  return (
    <DsCard
      eyebrow="Layout"
      title="Modules & visibility"
      headerRight={
        <button type="button" onClick={reset} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-2)", background: "var(--surface-card)", color: "var(--ink-2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <Icon n="refresh" size={13} /> Reset
        </button>
      }
    >
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "0 0 14px" }}>
        Turn cockpit modules on or off. Hidden modules aren&apos;t deleted — re-enable any time. Saved on this device.
      </p>
      <div className="modules-grid">
        {MODULES.map((m) => (
          <Row key={m.id} label={m.label} desc={m.desc}>
            <Switch checked={isOn(m.id)} onChange={(v) => setModule(m.id, v)} label={m.label} />
          </Row>
        ))}
      </div>
    </DsCard>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--border-1)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-1)" }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{desc}</div>
      </div>
      {children}
    </div>
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

function Hidden({ onNav }: { onNav: (s: Screen) => void }) {
  return (
    <DsCard>
      <div style={{ textAlign: "center", padding: "32px 16px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-1)" }}>Nothing to show here</p>
        <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "6px 0 14px" }}>The modules for this view are hidden.</p>
        <button type="button" onClick={() => onNav("status")} style={{ height: 36, padding: "0 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--brand-500)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Open Settings → Modules
        </button>
      </div>
    </DsCard>
  );
}
