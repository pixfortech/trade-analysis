import type { ReactNode } from "react";

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d={d} />
  </svg>
);

// Section ids must match the `id` props rendered on the dashboard page.
export const navItems: NavItem[] = [
  { id: "overview", label: "Market Overview", icon: <I d="M3 3v18h18M7 14l3-3 3 3 5-6" /> },
  { id: "watchlist", label: "Watchlist", icon: <I d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.9 7.1 19.2 8 13.7 4 9.8 9.5 9z" /> },
  { id: "chart", label: "Live Chart", icon: <I d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" /> },
  { id: "ai-reco", label: "AI Recommendation", icon: <I d="M12 3a6 6 0 00-3 11.2V17h6v-2.8A6 6 0 0012 3zM9 21h6M10 17v4M14 17v4" /> },
  { id: "futures", label: "Futures Analysis", icon: <I d="M3 12h4l2-7 4 14 2-7h6" /> },
  { id: "options", label: "Options Analysis", icon: <I d="M4 6h16M4 12h16M4 18h10" /> },
  { id: "trade-plan", label: "Trade Plan", icon: <I d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /> },
  { id: "risk", label: "Risk Management", icon: <I d="M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7z" /> },
  { id: "sentiment", label: "Market Sentiment", icon: <I d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 12l4-2M12 12V7" /> },
  { id: "scanner", label: "Scanner", icon: <I d="M11 4a7 7 0 105 12l4 4M11 4a7 7 0 017 7" /> },
];
