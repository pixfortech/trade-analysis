"use client";

import { useCallback } from "react";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { AITradeRecommendation } from "@/components/dashboard/AITradeRecommendation";
import { FuturesAnalysis } from "@/components/dashboard/FuturesAnalysis";
import { OptionsAnalysis } from "@/components/dashboard/OptionsAnalysis";
import { ScannerPlaceholder } from "@/components/dashboard/ScannerPlaceholder";
import { KiteStatusCard } from "@/components/dashboard/KiteStatusCard";
import { LiveMarketSignal } from "@/components/dashboard/LiveMarketSignal";
import { ActiveTradeMonitorCard } from "@/components/dashboard/ActiveTradeMonitorCard";
import { LiveWatchlist } from "@/components/dashboard/LiveWatchlist";
import { CustomizePanel } from "@/components/dashboard/CustomizePanel";
import { MarketStatusCard } from "@/components/dashboard/MarketStatusCard";
import { PaperTradingPanel } from "@/components/dashboard/PaperTradingPanel";
import { AccountSummaryCard } from "@/components/dashboard/AccountSummaryCard";
import { RiskManagementCard } from "@/components/dashboard/RiskManagementCard";
import { TopPerformersCard } from "@/components/dashboard/TopPerformersCard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  LAYOUT_STORAGE_KEY,
  defaultLayout,
  reconcileLayout,
  sizeToColSpan,
  type CardState,
  type WidgetSize,
} from "@/lib/dashboardLayout";

const CARD_COMPONENTS: Record<string, React.ReactNode> = {
  "market-status": <MarketStatusCard />,
  "live-market-signal": <LiveMarketSignal />,
  "paper-trading": <PaperTradingPanel />,
  "active-trade-monitor": <ActiveTradeMonitorCard />,
  "account-summary": <AccountSummaryCard />,
  "risk-management": <RiskManagementCard />,
  "top-performers": <TopPerformersCard />,
  watchlist: <LiveWatchlist />,
  "kite-status": <KiteStatusCard />,
  "market-overview": <MarketOverview />,
  "ai-recommendation": <AITradeRecommendation />,
  "futures-analysis": <FuturesAnalysis />,
  "options-analysis": <OptionsAnalysis />,
  scanner: <ScannerPlaceholder />,
};

export function DashboardGrid() {
  const { value: stored, setValue, reset, hydrated } = useLocalStorage<CardState[]>(
    LAYOUT_STORAGE_KEY,
    defaultLayout(),
  );
  const layout = reconcileLayout(stored);

  const toggle = useCallback(
    (id: string) => setValue((cur) => reconcileLayout(cur).map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))),
    [setValue],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) =>
      setValue((cur) => {
        const arr = reconcileLayout(cur);
        const i = arr.findIndex((c) => c.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= arr.length) return arr;
        const next = [...arr];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      }),
    [setValue],
  );

  const resize = useCallback(
    (id: string, size: WidgetSize) => setValue((cur) => reconcileLayout(cur).map((c) => (c.id === id ? { ...c, size } : c))),
    [setValue],
  );

  const visible = layout.filter((c) => c.visible);

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{hydrated ? `${visible.length} of ${layout.length} widgets shown` : " "}</p>
        <CustomizePanel layout={layout} onToggle={toggle} onMove={move} onResize={resize} onReset={reset} />
      </div>

      {/* 12-column responsive grid; widgets span by size. Stacks on mobile. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {visible.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-white/10 bg-base-800/40 px-4 py-10 text-center text-slate-400">
            All widgets are hidden. Click <span className="text-slate-200">Customise</span> to show some.
          </p>
        )}
        {visible.map((c) => (
          <div key={c.id} className={`col-span-1 ${sizeToColSpan(c.size)}`}>
            {CARD_COMPONENTS[c.id] ?? null}
          </div>
        ))}
      </div>
    </>
  );
}
