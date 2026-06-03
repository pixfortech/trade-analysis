// Dashboard model (Phase 3H). Widgets are arranged on a draggable/resizable
// 12-column grid (react-grid-layout). Visibility + grid geometry are persisted
// in localStorage. Only widgets backed by REAL backend data are visible by
// default; mock-only and simulated widgets are hidden (still available via
// Customise) so the default dashboard shows live data only.

export interface DashboardCardDef {
  id: string;
  title: string;
  /** Visible on first load. Only live-data widgets default to true. */
  defaultVisible: boolean;
  /** True if the widget reads real backend/Kite data (no mock). */
  live: boolean;
  /** Default grid geometry on the 12-col desktop grid. */
  w: number;
  h: number;
}

// Render/registration order. `w` is in 12 columns; `h` is in row units
// (ROW_HEIGHT px each). Heights are generous so content isn't clipped; users
// can resize freely.
export const DASHBOARD_CARDS: DashboardCardDef[] = [
  // --- live data, visible by default ---
  { id: "market-status", title: "Market Status", defaultVisible: true, live: true, w: 4, h: 9 },
  { id: "kite-status", title: "Zerodha Kite Status", defaultVisible: true, live: true, w: 4, h: 11 },
  { id: "account-summary", title: "Zerodha Account Summary", defaultVisible: true, live: true, w: 4, h: 11 },
  { id: "live-market-signal", title: "Live Market Signal", defaultVisible: true, live: true, w: 12, h: 34 },
  { id: "ai-recommendation", title: "AI Recommendation", defaultVisible: true, live: true, w: 6, h: 20 },
  { id: "risk-management", title: "Risk Management", defaultVisible: true, live: true, w: 6, h: 20 },
  { id: "active-trade-monitor", title: "Active Trade Monitor", defaultVisible: true, live: true, w: 6, h: 18 },
  { id: "manual-trade-tracker", title: "Manual Trade Tracker", defaultVisible: true, live: true, w: 6, h: 18 },
  { id: "watchlist", title: "Watchlist", defaultVisible: true, live: true, w: 6, h: 16 },
  { id: "top-performers", title: "Top Performers", defaultVisible: true, live: true, w: 6, h: 16 },
  // --- sample (not live) — hidden by default, opt-in via Customise ---
  { id: "market-overview", title: "Market Overview (sample)", defaultVisible: false, live: false, w: 12, h: 9 },
  { id: "futures-analysis", title: "Futures Analysis (sample)", defaultVisible: false, live: false, w: 12, h: 10 },
  { id: "options-analysis", title: "Options Analysis (sample)", defaultVisible: false, live: false, w: 6, h: 13 },
  { id: "scanner", title: "Scanner (sample)", defaultVisible: false, live: false, w: 12, h: 10 },
];

export const ROW_HEIGHT = 20; // px per grid row unit
export const GRID_COLS = 12;
export const GRID_MARGIN = 20; // px gap between widgets
export const MIN_W = 3; // never narrower than 3/12 columns on desktop

export interface RglItem {
  i: string; // card id
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardState {
  /** Per-card visibility. */
  visible: Record<string, boolean>;
  /** react-grid-layout positions for the desktop (lg) breakpoint. */
  layout: RglItem[];
}

// v2: Phase 3I default set/heights changed; old layouts self-heal to defaults.
export const LAYOUT_STORAGE_KEY = "dashboard.rgl.v2";

export function isLiveCard(id: string): boolean {
  return DASHBOARD_CARDS.find((c) => c.id === id)?.live ?? false;
}

export function titleFor(id: string): string {
  return DASHBOARD_CARDS.find((c) => c.id === id)?.title ?? id;
}

/** Build the default desktop layout by flowing visible cards left→right. */
export function defaultLayout(): RglItem[] {
  const items: RglItem[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const c of DASHBOARD_CARDS) {
    if (!c.defaultVisible) continue;
    if (x + c.w > GRID_COLS) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    items.push({ i: c.id, x, y, w: c.w, h: c.h });
    x += c.w;
    rowH = Math.max(rowH, c.h);
  }
  return items;
}

export function defaultVisibility(): Record<string, boolean> {
  const v: Record<string, boolean> = {};
  for (const c of DASHBOARD_CARDS) v[c.id] = c.defaultVisible;
  return v;
}

export function defaultState(): DashboardState {
  return { visible: defaultVisibility(), layout: defaultLayout() };
}

/** Validate/repair stored state; falls back to defaults on anything invalid. */
export function reconcileState(stored: DashboardState | null): DashboardState {
  if (!stored || typeof stored !== "object" || !Array.isArray(stored.layout) || typeof stored.visible !== "object") {
    return defaultState();
  }
  const known = new Map(DASHBOARD_CARDS.map((c) => [c.id, c]));
  const visible: Record<string, boolean> = {};
  for (const c of DASHBOARD_CARDS) visible[c.id] = Boolean(stored.visible[c.id] ?? c.defaultVisible);

  // Keep valid stored geometry; add defaults for newly-visible cards missing one.
  const byId = new Map<string, RglItem>();
  for (const it of stored.layout) {
    if (!it || !known.has(it.i)) continue;
    const w = clampInt(it.w, MIN_W, GRID_COLS, known.get(it.i)!.w);
    byId.set(it.i, {
      i: it.i,
      x: clampInt(it.x, 0, GRID_COLS - 1, 0),
      y: clampInt(it.y, 0, 10_000, 0),
      w,
      h: clampInt(it.h, 4, 10_000, known.get(it.i)!.h),
    });
  }
  // Ensure every visible card has a layout item (flow new ones to the bottom).
  let maxY = 0;
  for (const it of byId.values()) maxY = Math.max(maxY, it.y + it.h);
  for (const c of DASHBOARD_CARDS) {
    if (visible[c.id] && !byId.has(c.id)) {
      byId.set(c.id, { i: c.id, x: 0, y: maxY, w: c.w, h: c.h });
      maxY += c.h;
    }
  }
  return { visible, layout: Array.from(byId.values()) };
}

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}
