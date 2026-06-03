import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { GlobalControlBar } from "@/components/layout/GlobalControlBar";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { FloatingTradeAssistant } from "@/components/dashboard/FloatingTradeAssistant";
import { GlobalControlsProvider } from "@/hooks/useGlobalControls";
import { AiScannersProvider } from "@/lib/aiScanners";

export default function DashboardPage() {
  return (
    <GlobalControlsProvider>
    <AiScannersProvider>
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">
          <Header />

          {/* Global live-monitoring + alerts controls */}
          <GlobalControlBar />

          {/* Draggable/resizable dashboard (layout + visibility saved in localStorage) */}
          <DashboardGrid />

          <footer className="mt-10 border-t border-white/5 pt-6 text-center text-xs leading-relaxed text-slate-500">
            <p>
              AI Share Market Analysis Tool · Live read-only market data via Zerodha Kite. Advisory analysis only —
              for decision support, with no automatic trade execution.
            </p>
            <p className="mt-1.5">
              ⚠️ Not investment advice. No order placement, modification or trade execution. Trading in equities,
              futures &amp; options involves substantial risk of loss. Levels and probabilities are estimates based on
              live/historical data.
            </p>
          </footer>
        </main>
      </div>

      {/* Sticky, always-on AI trade assistant (follows the selected instrument) */}
      <FloatingTradeAssistant />
    </div>
    </AiScannersProvider>
    </GlobalControlsProvider>
  );
}
