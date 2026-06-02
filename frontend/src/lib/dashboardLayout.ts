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

// Bumped to v5 to migrate away from the broken Phase-3G grid that produced
// 1/12-width "strip" widgets. Old keys (…v4 and earlier) are ignored, so any
// broken saved layout self-heals to the safe defaults on first load.
export const LAYOUT_STORAGE_KEY = "dashboard.layout.v5";

export const SIZE_LABELS: Record<WidgetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  full: "Full width",
};

// Minimum usable widget width — no card may ever be narrower than this.
export const MIN_WIDGET_PX = 360;

/**
 * How many base columns a widget spans in an auto-fit grid whose base column is
 * MIN_WIDGET_PX wide. The grid is rendered with inline styles (NOT Tailwind
 * span classes) so nothing can be purged — this was the regression cause.
 *  - small  → 1 base column  (~360px)
 *  - medium → 1 base column
 *  - large  → 2 base columns
 *  - full   → all columns
 */
export function sizeToSpan(size: WidgetSize): number {
  switch (size) {
    case "small":
      return 1;
    case "medium":
      return 1;
    case "large":
      return 2;
    case "full":
    default:
      return Number.MAX_SAFE_INTEGER; // clamped to the current column count
  }
}

export function defaultLayout(): CardState[] {
  return DASHBOARD_CARDS.map((c) => ({ id: c.id, visible: c.defaultVisible, size: c.defaultSize }));
}

const VALID_SIZES: WidgetSize[] = ["small", "medium", "large", "full"];

/** Coerce any stored size to a valid preset (clamps broken/legacy values). */
function safeSize(size: unknown, fallback: WidgetSize): WidgetSize {
  return typeof size === "string" && (VALID_SIZES as string[]).includes(size) ? (size as WidgetSize) : fallback;
}

/** Merge a stored layout with the canonical card list (handles added/removed cards). */
export function reconcileLayout(stored: CardState[] | null): CardState[] {
  if (!stored || !Array.isArray(stored)) return defaultLayout();
  const known = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: CardState[] = [];
  for (const s of stored) {
    const def = known.get(s?.id);
    if (def && !seen.has(s.id)) {
      out.push({ id: s.id, visible: Boolean(s.visible), size: safeSize(s.size, def.defaultSize) });
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
