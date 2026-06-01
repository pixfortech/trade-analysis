"use client";

import { useCallback } from "react";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { LiveChartPlaceholder } from "@/components/dashboard/LiveChartPlaceholder";
import { AITradeRecommendation } from "@/components/dashboard/AITradeRecommendation";
import { FuturesAnalysis } from "@/components/dashboard/FuturesAnalysis";
import { OptionsAnalysis } from "@/components/dashboard/OptionsAnalysis";
import { RiskManagement } from "@/components/dashboard/RiskManagement";
import { MarketSentiment } from "@/components/dashboard/MarketSentiment";
import { ScannerPlaceholder } from "@/components/dashboard/ScannerPlaceholder";
import { KiteStatusCard } from "@/components/dashboard/KiteStatusCard";
import { LiveTradePlanCard } from "@/components/dashboard/LiveTradePlanCard";
import { LiveWatchlist } from "@/components/dashboard/LiveWatchlist";
import { CustomizePanel } from "@/components/dashboard/CustomizePanel";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  LAYOUT_STORAGE_KEY,
  defaultLayout,
  reconcileLayout,
  type CardState,
} from "@/lib/dashboardLayout";

// Map card id → element. (LiveChart is shown with the chart, not customisable.)
const CARD_COMPONENTS: Record<string, React.ReactNode> = {
  "market-overview": <MarketOverview />,
  "kite-live-data": <KiteStatusCard />,
  "live-trade-plan": <LiveTradePlanCard />,
  watchlist: <LiveWatchlist />,
  "ai-recommendation": <AITradeRecommendation />,
  "futures-analysis": <FuturesAnalysis />,
  "options-analysis": <OptionsAnalysis />,
  "risk-management": <RiskManagement />,
  "market-sentiment": <MarketSentiment />,
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

  const visible = layout.filter((c) => c.visible);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {hydrated ? `${visible.length} of ${layout.length} cards shown` : " "}
        </p>
        <CustomizePanel layout={layout} onToggle={toggle} onMove={move} onReset={reset} />
      </div>

      {/* Chart + AI recommendation always lead the dashboard. */}
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LiveChartPlaceholder />
          </div>
          {isVisible(visible, "ai-recommendation") ? <AITradeRecommendation /> : <div className="hidden lg:block" />}
        </div>

        {visible
          .filter((c) => c.id !== "ai-recommendation")
          .map((c) => (
            <div key={c.id}>{CARD_COMPONENTS[c.id] ?? null}</div>
          ))}
      </div>
    </>
  );
}

function isVisible(list: CardState[], id: string): boolean {
  return list.some((c) => c.id === id && c.visible);
}
