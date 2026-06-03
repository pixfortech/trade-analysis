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
  { id: "live-market-signal", title: "Live Market Signal", defaultVisible: true, live: true, w: 12, h: 40 },
  { id: "ai-scanners", title: "AI Trade Scanners", defaultVisible: true, live: true, w: 12, h: 14 },
  { id: "ai-recommendation", title: "AI Recommendation", defaultVisible: true, live: true, w: 6, h: 26 },
  { id: "risk-management", title: "Trade Size & Risk Planner", defaultVisible: true, live: true, w: 6, h: 22 },
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

// Responsive breakpoints + column counts for react-grid-layout. The desktop
// layout (lg, 12 cols) is what the user customises and what we persist; other
// breakpoints are DERIVED so cards always fill the available width.
export const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;
export const COLS = { lg: 12, md: 12, sm: 8, xs: 1, xxs: 1 } as const;
export type Breakpoint = keyof typeof COLS;

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
// v3: taller default heights for Live Signal / AI Rec so analysis fits.
export const LAYOUT_STORAGE_KEY = "dashboard.rgl.v3";

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

/**
 * Build a react-grid-layout `layouts` object for every breakpoint from the
 * persisted desktop (lg) items. Other breakpoints are DERIVED so the grid
 * always fills the available width and never leaves a big blank column:
 *  - lg (12) / md (12): use the saved positions as-is.
 *  - sm (8): scale widths to 8 cols and re-flow left→right.
 *  - xs / xxs (1): single full-width column, preserving visual order.
 * minW/minH are attached so resizing never crushes a card.
 */
export function responsiveLayouts(items: RglItem[]): Record<Breakpoint, (RglItem & { minW: number; minH: number })[]> {
  const minH = (id: string) => Math.max(6, Math.round((DASHBOARD_CARDS.find((c) => c.id === id)?.h ?? 12) * 0.6));
  const ordered = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  // lg / md: keep saved geometry.
  const lg = items.map((it) => ({ ...it, minW: MIN_W, minH: minH(it.i) }));

  // sm (8 cols): scale each width from /12 to /8, re-flow.
  const sm = flow(
    ordered.map((it) => ({ ...it, w: Math.max(2, Math.min(8, Math.round((it.w / GRID_COLS) * 8))) })),
    8,
  ).map((it) => ({ ...it, minW: 2, minH: minH(it.i) }));

  // xs / xxs: single column, full width, stacked in order.
  const single = ordered.map((it, idx) => ({
    i: it.i,
    x: 0,
    y: idx, // RGL compacts vertically; y order is what matters
    w: 1,
    h: it.h,
    minW: 1,
    minH: minH(it.i),
  }));

  return { lg, md: lg, sm, xs: single, xxs: single };
}

/** Left→right flow within `cols`, wrapping to the next row. */
function flow(items: RglItem[], cols: number): RglItem[] {
  const out: RglItem[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const it of items) {
    const w = Math.min(it.w, cols);
    if (x + w > cols) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    out.push({ ...it, x, y, w });
    x += w;
    rowH = Math.max(rowH, it.h);
  }
  return out;
}

