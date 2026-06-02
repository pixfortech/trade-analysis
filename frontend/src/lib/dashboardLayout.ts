// Dashboard customisation model (Phase 3D/3E). Card visibility + order are
// persisted in localStorage; no backend needed for layout preferences.

export interface DashboardCardDef {
  id: string;
  title: string;
  defaultVisible: boolean;
}

// Order here is the default render order. Phase 3E: the Live Market Signal is
// the primary card; demo/mock cards are hidden by default for a clean home.
export const DASHBOARD_CARDS: DashboardCardDef[] = [
  { id: "live-market-signal", title: "Live Market Signal (with chart)", defaultVisible: true },
  { id: "active-trade-monitor", title: "Active Trade Monitor", defaultVisible: true },
  { id: "watchlist", title: "Watchlist", defaultVisible: true },
  { id: "kite-status", title: "Zerodha Kite Status", defaultVisible: true },
  { id: "risk-management", title: "Risk Management", defaultVisible: true },
  { id: "market-overview", title: "Market Overview", defaultVisible: false },
  { id: "ai-recommendation", title: "AI Recommendation", defaultVisible: false },
  { id: "futures-analysis", title: "Futures Analysis", defaultVisible: false },
  { id: "options-analysis", title: "Options Analysis", defaultVisible: false },
  { id: "scanner", title: "Scanner", defaultVisible: false },
  { id: "raw-kite-data", title: "Raw Kite Data (quote test)", defaultVisible: false },
];

export interface CardState {
  id: string;
  visible: boolean;
}

// Bumped to v3 because Phase 3F adds the Active Trade Monitor to defaults.
export const LAYOUT_STORAGE_KEY = "dashboard.layout.v3";

export function defaultLayout(): CardState[] {
  return DASHBOARD_CARDS.map((c) => ({ id: c.id, visible: c.defaultVisible }));
}

/** Merge a stored layout with the canonical card list (handles added/removed cards). */
export function reconcileLayout(stored: CardState[] | null): CardState[] {
  if (!stored || !Array.isArray(stored)) return defaultLayout();
  const known = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: CardState[] = [];
  for (const s of stored) {
    if (known.has(s.id) && !seen.has(s.id)) {
      out.push({ id: s.id, visible: Boolean(s.visible) });
      seen.add(s.id);
    }
  }
  for (const c of DASHBOARD_CARDS) {
    if (!seen.has(c.id)) out.push({ id: c.id, visible: c.defaultVisible });
  }
  return out;
}

export function titleFor(id: string): string {
  return DASHBOARD_CARDS.find((c) => c.id === id)?.title ?? id;
}
