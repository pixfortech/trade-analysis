// Dashboard customisation model (Phase 3D). Card visibility + order are
// persisted in localStorage; no backend needed for layout preferences.

export interface DashboardCardDef {
  id: string;
  title: string;
  defaultVisible: boolean;
}

// Order here is the default render order.
export const DASHBOARD_CARDS: DashboardCardDef[] = [
  { id: "market-overview", title: "Market Overview", defaultVisible: true },
  { id: "kite-live-data", title: "Live Data — Zerodha Kite", defaultVisible: true },
  { id: "live-trade-plan", title: "Live Trade Plan", defaultVisible: true },
  { id: "watchlist", title: "Watchlist", defaultVisible: true },
  { id: "ai-recommendation", title: "AI Recommendation", defaultVisible: true },
  { id: "futures-analysis", title: "Futures Analysis", defaultVisible: true },
  { id: "options-analysis", title: "Options Analysis", defaultVisible: true },
  { id: "risk-management", title: "Risk Management", defaultVisible: true },
  { id: "market-sentiment", title: "Market Sentiment", defaultVisible: true },
  { id: "scanner", title: "Scanner", defaultVisible: true },
];

export interface CardState {
  id: string;
  visible: boolean;
}

export const LAYOUT_STORAGE_KEY = "dashboard.layout.v1";

export function defaultLayout(): CardState[] {
  return DASHBOARD_CARDS.map((c) => ({ id: c.id, visible: c.defaultVisible }));
}

/** Merge a stored layout with the canonical card list (handles added/removed cards). */
export function reconcileLayout(stored: CardState[] | null): CardState[] {
  if (!stored || !Array.isArray(stored)) return defaultLayout();
  const known = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: CardState[] = [];
  // keep stored order for known ids
  for (const s of stored) {
    if (known.has(s.id) && !seen.has(s.id)) {
      out.push({ id: s.id, visible: Boolean(s.visible) });
      seen.add(s.id);
    }
  }
  // append any new cards not present in stored
  for (const c of DASHBOARD_CARDS) {
    if (!seen.has(c.id)) out.push({ id: c.id, visible: c.defaultVisible });
  }
  return out;
}

export function titleFor(id: string): string {
  return DASHBOARD_CARDS.find((c) => c.id === id)?.title ?? id;
}
