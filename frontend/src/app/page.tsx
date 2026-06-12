import { TerminalApp } from "@/components/terminal/TerminalApp";
import { GlobalControlsProvider } from "@/hooks/useGlobalControls";
import { ModulesProvider } from "@/hooks/useModules";
import { AiScannersProvider } from "@/lib/aiScanners";

export default function DashboardPage() {
  return (
    <GlobalControlsProvider>
      <ModulesProvider>
        <AiScannersProvider>
          <TerminalApp />
        </AiScannersProvider>
      </ModulesProvider>
    </GlobalControlsProvider>
  );
}
