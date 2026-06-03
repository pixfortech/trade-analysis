"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { LiveAIRecommendation } from "@/components/dashboard/LiveAIRecommendation";
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
import { useGlobalControls } from "@/hooks/useGlobalControls";
import {
  BREAKPOINTS,
  COLS,
  DASHBOARD_CARDS,
  GRID_MARGIN,
  LAYOUT_STORAGE_KEY,
  ROW_HEIGHT,
  defaultState,
  reconcileState,
  responsiveLayouts,
  titleFor,
  type Breakpoint,
  type DashboardState,
  type RglItem,
} from "@/lib/dashboardLayout";

const ResponsiveGridLayout = WidthProvider(Responsive);

const CARD_COMPONENTS: Record<string, React.ReactNode> = {
  "market-status": <MarketStatusCard />,
  "kite-status": <KiteStatusCard />,
  "account-summary": <AccountSummaryCard />,
  "live-market-signal": <LiveMarketSignal />,
  "ai-recommendation": <LiveAIRecommendation />,
  "risk-management": <RiskManagementCard />,
  "active-trade-monitor": <ActiveTradeMonitorCard />,
  "manual-trade-tracker": <PaperTradingPanel />,
  watchlist: <LiveWatchlist />,
  "top-performers": <TopPerformersCard />,
  "market-overview": <MarketOverview />,
  "futures-analysis": <FuturesAnalysis />,
  "options-analysis": <OptionsAnalysis />,
  scanner: <ScannerPlaceholder />,
};

export function DashboardGrid() {
  const { value: stored, setValue, reset, hydrated } = useLocalStorage<DashboardState>(
    LAYOUT_STORAGE_KEY,
    defaultState(),
  );
  const state = reconcileState(stored);
  const [editing, setEditing] = useState(false);
  const bpRef = useRef<Breakpoint>("lg");
  const { sidebarMode } = useGlobalControls();

  const visibleItems = useMemo(
    () => state.layout.filter((it) => state.visible[it.i]),
    [state],
  );

  // Persist geometry ONLY from the desktop (lg/md) breakpoint. Saving the
  // derived mobile single-column layout would corrupt the user's desktop
  // arrangement — that was part of the squeezed-layout bug.
  const onLayoutChange = useCallback(
    (current: Layout[]) => {
      if (!current?.length) return;
      if (bpRef.current !== "lg" && bpRef.current !== "md") return;
      const next: RglItem[] = current.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
      setValue((cur) => {
        const base = reconcileState(cur);
        const byId = new Map(base.layout.map((it) => [it.i, it]));
        for (const it of next) byId.set(it.i, it);
        return { ...base, layout: Array.from(byId.values()) };
      });
    },
    [setValue],
  );

  const toggle = useCallback(
    (id: string) =>
      setValue((cur) => {
        const base = reconcileState(cur);
        const nowVisible = !base.visible[id];
        const visible = { ...base.visible, [id]: nowVisible };
        let layout = base.layout;
        if (nowVisible && !layout.some((it) => it.i === id)) {
          const def = DASHBOARD_CARDS.find((c) => c.id === id)!;
          const maxY = layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
          layout = [...layout, { i: id, x: 0, y: maxY, w: def.w, h: def.h }];
        }
        return { visible, layout };
      }),
    [setValue],
  );

  // After hydration the sidebar (hidden lg:flex) appears without firing a
  // window resize, so WidthProvider can keep a stale/narrow measurement → thin
  // cards + blank right side. Force a few remeasures once mounted.
  useEffect(() => {
    if (!hydrated) return;
    const fire = () => window.dispatchEvent(new Event("resize"));
    const timers = [0, 150, 400, 800].map((ms) => window.setTimeout(fire, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [hydrated, visibleItems.length, editing, sidebarMode]);

  // Avoid SSR/hydration mismatch: render the grid only after hydration.
  if (!hydrated) {
    return <div className="min-h-[40vh]" aria-hidden />;
  }

  // Derive layouts for every breakpoint from the persisted desktop items.
  const layouts = responsiveLayouts(visibleItems);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {visibleItems.length} widget{visibleItems.length === 1 ? "" : "s"} shown · live read-only data
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              editing ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 bg-base-800/70 text-slate-200 hover:bg-base-700"
            }`}
          >
            {editing ? "Done arranging" : "Arrange widgets"}
          </button>
          <CustomizePanel visible={state.visible} onToggle={toggle} onReset={reset} />
        </div>
      </div>

      {editing && (
        <p className="mb-3 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-accent">
          Drag a widget by its title bar to move it; drag the bottom-right corner to resize. Your layout saves
          automatically.
        </p>
      )}

      {visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-base-800/40 px-4 py-10 text-center text-slate-400">
          No widgets shown. Click <span className="text-slate-200">Customise</span> to add some.
        </p>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={[GRID_MARGIN, GRID_MARGIN]}
          containerPadding={[0, 0]}
          isDraggable={editing}
          isResizable={editing}
          draggableHandle=".widget-drag-handle"
          // Don't start a drag from interactive elements inside a card.
          draggableCancel="input,textarea,select,button,a,[role='listbox'],[role='combobox'],canvas,table,svg"
          onBreakpointChange={(bp: string) => {
            bpRef.current = bp as Breakpoint;
          }}
          onLayoutChange={onLayoutChange}
          measureBeforeMount={false}
          useCSSTransforms
        >
          {visibleItems.map((it) => (
            <div key={it.i} className="h-full min-h-0">
              <Widget id={it.i} editing={editing}>
                {CARD_COMPONENTS[it.i] ?? null}
              </Widget>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </>
  );
}

/** Wraps a card; in edit mode shows a drag handle bar at the top. The card
 *  itself scrolls internally, so this wrapper only clips (no nested scroll). */
function Widget({ id, editing, children }: { id: string; editing: boolean; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {editing && (
        <div className="widget-drag-handle flex shrink-0 cursor-move items-center justify-between rounded-t-lg border border-b-0 border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent">
          <span className="flex min-w-0 items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
              <circle cx="8" cy="6" r="1.4" /><circle cx="8" cy="12" r="1.4" /><circle cx="8" cy="18" r="1.4" />
              <circle cx="16" cy="6" r="1.4" /><circle cx="16" cy="12" r="1.4" /><circle cx="16" cy="18" r="1.4" />
            </svg>
            <span className="truncate">{titleFor(id)}</span>
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-accent/70">drag · resize ↘</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
