"use client";

import { useCallback } from "react";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { AITradeRecommendation } from "@/components/dashboard/AITradeRecommendation";
import { FuturesAnalysis } from "@/components/dashboard/FuturesAnalysis";
import { OptionsAnalysis } from "@/components/dashboard/OptionsAnalysis";
import { RiskManagement } from "@/components/dashboard/RiskManagement";
import { ScannerPlaceholder } from "@/components/dashboard/ScannerPlaceholder";
import { KiteStatusCard } from "@/components/dashboard/KiteStatusCard";
import { LiveMarketSignal } from "@/components/dashboard/LiveMarketSignal";
import { LiveWatchlist } from "@/components/dashboard/LiveWatchlist";
import { CustomizePanel } from "@/components/dashboard/CustomizePanel";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  LAYOUT_STORAGE_KEY,
  defaultLayout,
  reconcileLayout,
  type CardState,
} from "@/lib/dashboardLayout";

// Map card id → element. Cards hidden by default keep the home page clean.
const CARD_COMPONENTS: Record<string, React.ReactNode> = {
  "live-market-signal": <LiveMarketSignal />,
  watchlist: <LiveWatchlist />,
  "kite-status": <KiteStatusCard />,
  "risk-management": <RiskManagement />,
  "market-overview": <MarketOverview />,
  "ai-recommendation": <AITradeRecommendation />,
  "futures-analysis": <FuturesAnalysis />,
  "options-analysis": <OptionsAnalysis />,
  scanner: <ScannerPlaceholder />,
  // Raw Kite quote test lives in the Kite Status card; surface it again here
  // for users who want a dedicated raw-data panel.
  "raw-kite-data": <KiteStatusCard />,
};

export function DashboardGrid() {
  const { value: stored, setValue, reset, hydrated } = useLocalStorage<CardState[]>(
    LAYOUT_STORAGE_KEY,
    defaultLayout(),
  );
  const layout = reconcileLayout(stored);

  const toggle = useCallback(
    (id: string) =>
      setValue((cur) => reconcileLayout(cur).map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))),
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
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {hydrated ? `${visible.length} of ${layout.length} cards shown` : " "}
        </p>
        <CustomizePanel layout={layout} onToggle={toggle} onMove={move} onReset={reset} />
      </div>

      <div className="space-y-5">
        {visible.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 bg-base-800/40 px-4 py-10 text-center text-slate-400">
            All cards are hidden. Click <span className="text-slate-200">Customise</span> to show some.
          </p>
        )}
        {visible.map((c) => (
          <div key={c.id}>{CARD_COMPONENTS[c.id] ?? null}</div>
        ))}
      </div>
    </>
  );
}
