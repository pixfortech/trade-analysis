import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { LiveChartPlaceholder } from "@/components/dashboard/LiveChartPlaceholder";
import { AITradeRecommendation } from "@/components/dashboard/AITradeRecommendation";
import { FuturesAnalysis } from "@/components/dashboard/FuturesAnalysis";
import { OptionsAnalysis } from "@/components/dashboard/OptionsAnalysis";
import { TradePlan } from "@/components/dashboard/TradePlan";
import { RiskManagement } from "@/components/dashboard/RiskManagement";
import { MarketSentiment } from "@/components/dashboard/MarketSentiment";
import { ScannerPlaceholder } from "@/components/dashboard/ScannerPlaceholder";
import { LiveAnalysis } from "@/components/dashboard/LiveAnalysis";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <Header />
          <div className="mb-4">
            <MobileNav />
          </div>

          {/* Full-width sections */}
          <div className="space-y-4">
            <MarketOverview />

            {/* Chart + AI recommendation */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <LiveChartPlaceholder />
              </div>
              <AITradeRecommendation />
            </div>

            {/* Live analysis — API-wired demo (frontend → backend → AI engine) */}
            <LiveAnalysis />

            {/* Watchlist + Options */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Watchlist />
              <OptionsAnalysis />
            </div>

            {/* Futures full width */}
            <FuturesAnalysis />

            {/* Trade plan + Risk + Sentiment */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <TradePlan />
              <RiskManagement />
              <MarketSentiment />
            </div>

            {/* Scanner full width */}
            <ScannerPlaceholder />
          </div>

          <footer className="mt-8 border-t border-white/5 pt-5 text-center text-[11px] leading-relaxed text-slate-600">
            <p>
              AI Share Market Analysis Tool · Phases 1–2 (foundation + service wiring). All figures are
              mock/demo data for UI demonstration — <span className="text-slate-500">not live market data</span>.
            </p>
            <p className="mt-1">
              ⚠️ Educational use only. Not investment advice. Trading in equities, futures &amp; options involves
              substantial risk of loss. Live data depends on authorised API providers.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
