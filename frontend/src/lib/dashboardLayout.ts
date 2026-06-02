// Dashboard customisation model (Phase 3D–3G). Card visibility, ORDER and SIZE
// are persisted in localStorage; no backend needed for layout preferences.

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface DashboardCardDef {
  id: string;
  title: string;
  defaultVisible: boolean;
  defaultSize: WidgetSize;
}

// Order here is the default render order. Phase 3G: paper trading + account +
// top performers + market status added; demo/mock cards hidden by default.
export const DASHBOARD_CARDS: DashboardCardDef[] = [
  { id: "market-status", title: "Market Status", defaultVisible: true, defaultSize: "small" },
  { id: "live-market-signal", title: "Live Market Signal (with chart)", defaultVisible: true, defaultSize: "full" },
  { id: "paper-trading", title: "Paper Trading", defaultVisible: true, defaultSize: "large" },
  { id: "active-trade-monitor", title: "Active Trade Monitor", defaultVisible: true, defaultSize: "medium" },
  { id: "account-summary", title: "Zerodha Account Summary", defaultVisible: true, defaultSize: "medium" },
  { id: "risk-management", title: "Risk Management", defaultVisible: true, defaultSize: "medium" },
  { id: "top-performers", title: "Top Performers", defaultVisible: true, defaultSize: "large" },
  { id: "watchlist", title: "Watchlist", defaultVisible: true, defaultSize: "medium" },
  { id: "kite-status", title: "Zerodha Kite Status", defaultVisible: false, defaultSize: "medium" },
  { id: "market-overview", title: "Market Overview", defaultVisible: false, defaultSize: "full" },
  { id: "ai-recommendation", title: "AI Recommendation", defaultVisible: false, defaultSize: "medium" },
  { id: "futures-analysis", title: "Futures Analysis", defaultVisible: false, defaultSize: "full" },
  { id: "options-analysis", title: "Options Analysis", defaultVisible: false, defaultSize: "medium" },
  { id: "scanner", title: "Scanner", defaultVisible: false, defaultSize: "full" },
];

export interface CardState {
  id: string;
  visible: boolean;
  size: WidgetSize;
}

// Bumped to v4 because Phase 3G changes the default card set + adds size.
export const LAYOUT_STORAGE_KEY = "dashboard.layout.v4";

export const SIZE_LABELS: Record<WidgetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  full: "Full width",
};

/** Tailwind column-span for a 12-col grid (responsive). */
export function sizeToColSpan(size: WidgetSize): string {
  switch (size) {
    case "small":
      return "lg:col-span-3";
    case "medium":
      return "lg:col-span-4";
    case "large":
      return "lg:col-span-6";
    case "full":
    default:
      return "lg:col-span-12";
  }
}

export function defaultLayout(): CardState[] {
  return DASHBOARD_CARDS.map((c) => ({ id: c.id, visible: c.defaultVisible, size: c.defaultSize }));
}

/** Merge a stored layout with the canonical card list (handles added/removed cards). */
export function reconcileLayout(stored: CardState[] | null): CardState[] {
  if (!stored || !Array.isArray(stored)) return defaultLayout();
  const known = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: CardState[] = [];
  for (const s of stored) {
    const def = known.get(s.id);
    if (def && !seen.has(s.id)) {
      out.push({ id: s.id, visible: Boolean(s.visible), size: s.size ?? def.defaultSize });
      seen.add(s.id);
    }
  }
  for (const c of DASHBOARD_CARDS) {
    if (!seen.has(c.id)) out.push({ id: c.id, visible: c.defaultVisible, size: c.defaultSize });
  }
  return out;
}

export function titleFor(id: string): string {
  return DASHBOARD_CARDS.find((c) => c.id === id)?.title ?? id;
}
