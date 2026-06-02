"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  MIN_WIDGET_PX,
  defaultLayout,
  reconcileLayout,
  sizeToSpan,
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

  // Track how many base columns currently fit, so a "large"/"full" widget can
  // span the right amount. The grid itself is auto-fit minmax(MIN_WIDGET_PX,1fr)
  // via INLINE STYLES — no Tailwind span classes (those were purged and caused
  // the strip regression).
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const GAP = 20; // matches the 1.25rem gap below
    const measure = () => {
      const w = el.clientWidth;
      setCols(Math.max(1, Math.floor((w + GAP) / (MIN_WIDGET_PX + GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{hydrated ? `${visible.length} of ${layout.length} widgets shown` : " "}</p>
        <CustomizePanel layout={layout} onToggle={toggle} onMove={move} onResize={resize} onReset={reset} />
      </div>

      {/* Responsive auto-fit grid: every column is >= MIN_WIDGET_PX, so a widget
          can never collapse into a thin strip. Single column on narrow screens. */}
      <div
        ref={gridRef}
        style={{
          display: "grid",
          gap: "1.25rem",
          gridTemplateColumns: `repeat(auto-fit, minmax(min(${MIN_WIDGET_PX}px, 100%), 1fr))`,
        }}
      >
        {visible.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 bg-base-800/40 px-4 py-10 text-center text-slate-400">
            All widgets are hidden. Click <span className="text-slate-200">Customise</span> to show some.
          </p>
        )}
        {visible.map((c) => {
          // Clamp the span to the columns that actually fit (never overflow,
          // never below 1). On a 1-column layout everything is full width.
          const span = Math.min(sizeToSpan(c.size), cols) || 1;
          return (
            <div key={c.id} style={{ gridColumn: cols > 1 ? `span ${span}` : "auto", minWidth: 0 }}>
              {CARD_COMPONENTS[c.id] ?? null}
            </div>
          );
        })}
      </div>
    </>
  );
}
