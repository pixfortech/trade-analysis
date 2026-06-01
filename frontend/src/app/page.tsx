import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Header />
          <div className="mb-5">
            <MobileNav />
          </div>

          {/* Customisable dashboard (visibility + order persisted in localStorage) */}
          <DashboardGrid />

          <footer className="mt-10 border-t border-white/5 pt-6 text-center text-xs leading-relaxed text-slate-500">
            <p>
              AI Share Market Analysis Tool · Live data via Zerodha Kite is{" "}
              <span className="text-slate-400">read-only</span>. Other widgets use mock/demo data until wired to
              live sources.
            </p>
            <p className="mt-1.5">
              ⚠️ Educational use only. Not investment advice. No order placement or trade execution. Trading in
              equities, futures &amp; options involves substantial risk of loss. Live data depends on authorised API
              providers.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
