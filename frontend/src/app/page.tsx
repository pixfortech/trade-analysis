import { TerminalApp } from "@/components/terminal/TerminalApp";
import { GlobalControlsProvider } from "@/hooks/useGlobalControls";
import { ModulesProvider } from "@/hooks/useModules";
import { PublicConfigProvider } from "@/hooks/usePublicConfig";
import { AnalysisSessionProvider } from "@/hooks/useAnalysisSession";
import { TickStreamProvider } from "@/hooks/useTickStream";
import { AiScannersProvider } from "@/lib/aiScanners";

export default function DashboardPage() {
  return (
    <PublicConfigProvider>
      <GlobalControlsProvider>
        <ModulesProvider>
          <AiScannersProvider>
            {/* Mounted ABOVE the screen switch so the analysed instrument, its
                locked plan and the monitoring baseline survive tab changes. */}
            <AnalysisSessionProvider>
              {/* One shared SSE connection to the Kite→SSE relay for live ticks. */}
              <TickStreamProvider>
                <TerminalApp />
              </TickStreamProvider>
            </AnalysisSessionProvider>
          </AiScannersProvider>
        </ModulesProvider>
      </GlobalControlsProvider>
    </PublicConfigProvider>
  );
}
