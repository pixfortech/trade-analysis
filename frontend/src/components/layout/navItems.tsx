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

// Only items that map to a real, functional live-data widget on the dashboard.
// Clicking one scrolls to that widget's section (ids match the rendered cards).
export const navItems: NavItem[] = [
  { id: "live-market-signal", label: "Live Signal", icon: <I d="M3 3v18h18M7 14l3-3 3 3 5-6" /> },
  { id: "watchlist", label: "Watchlist", icon: <I d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.9 7.1 19.2 8 13.7 4 9.8 9.5 9z" /> },
  { id: "top-performers", label: "Top Performers", icon: <I d="M4 19V5M4 19h16M8 16l3-4 3 2 4-6" /> },
  { id: "active-trade-monitor", label: "Trade Monitor", icon: <I d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /> },
  { id: "risk-management", label: "Risk Management", icon: <I d="M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7z" /> },
  { id: "kite-status", label: "Kite Status", icon: <I d="M12 3a6 6 0 00-3 11.2V17h6v-2.8A6 6 0 0012 3zM9 21h6" /> },
];
