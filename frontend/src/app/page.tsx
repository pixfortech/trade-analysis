import { TerminalApp } from "@/components/terminal/TerminalApp";
import { GlobalControlsProvider } from "@/hooks/useGlobalControls";
import { ModulesProvider } from "@/hooks/useModules";
import { PublicConfigProvider } from "@/hooks/usePublicConfig";
import { AiScannersProvider } from "@/lib/aiScanners";

export default function DashboardPage() {
  return (
    <PublicConfigProvider>
      <GlobalControlsProvider>
        <ModulesProvider>
          <AiScannersProvider>
            <TerminalApp />
          </AiScannersProvider>
        </ModulesProvider>
      </GlobalControlsProvider>
    </PublicConfigProvider>
  );
}
