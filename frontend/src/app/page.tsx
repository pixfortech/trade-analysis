import { TerminalApp } from "@/components/terminal/TerminalApp";
import { GlobalControlsProvider } from "@/hooks/useGlobalControls";
import { AiScannersProvider } from "@/lib/aiScanners";

export default function DashboardPage() {
  return (
    <GlobalControlsProvider>
      <AiScannersProvider>
        <TerminalApp />
      </AiScannersProvider>
    </GlobalControlsProvider>
  );
}
