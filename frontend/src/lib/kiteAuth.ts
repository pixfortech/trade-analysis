// Cross-tab Kite-auth signalling — the single source of truth for telling the
// dashboard that a Kite login just succeeded (in a different tab), so it can
// refresh status WITHOUT a manual page reload.
//
// How it works (all same-origin as the dashboard):
//   • publishKiteConnected() — called by the /kite/connected page after a
//     successful login. It writes a timestamped localStorage flag (which fires a
//     `storage` event in OTHER tabs) and broadcasts on BroadcastChannel.
//   • subscribeKiteConnected() — called on the dashboard. It listens on
//     BroadcastChannel + `storage`, and also checks for a very recent flag on
//     subscribe (covers races / same-tab reloads). De-duplicated.

export const KITE_CONNECTED_KEY = "kite_connected_success";
export const KITE_CHANNEL = "kite-auth";
/** App-level DOM event every Kite-dependent module listens to (in-tab fan-out). */
export const KITE_CONNECTED_EVENT = "kite:connected";

/** How recent a stored flag must be to count as "just connected" on subscribe. */
const RECENT_MS = 20_000;

/**
 * Fire ONE app-level `kite:connected` event so every Kite-dependent module can
 * refetch at once. Throttled — the bridge (cross-tab) and the connect poll can
 * both detect the same login within a moment. Safe outside the browser (no-op).
 */
let lastEmit = 0;
export function emitKiteConnected(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastEmit < 1200) return; // collapse duplicate detections into one
  lastEmit = now;
  window.dispatchEvent(new CustomEvent(KITE_CONNECTED_EVENT));
}

export interface KiteConnectedMessage {
  type: "kite-connected";
  status: "success";
  at: number;
}

/** Signal every listening tab that Kite is now connected. Best-effort/safe. */
export function publishKiteConnected(): void {
  if (typeof window === "undefined") return;
  const at = Date.now();
  try {
    // Writing localStorage fires a `storage` event in OTHER same-origin tabs.
    window.localStorage.setItem(KITE_CONNECTED_KEY, JSON.stringify({ at }));
  } catch {
    /* storage disabled — BroadcastChannel below may still work */
  }
  try {
    const bc = new BroadcastChannel(KITE_CHANNEL);
    const msg: KiteConnectedMessage = { type: "kite-connected", status: "success", at };
    bc.postMessage(msg);
    // Close AFTER a beat — closing immediately can drop the just-posted message
    // in some engines. The page closes/redirects shortly, so this is safe.
    setTimeout(() => {
      try {
        bc.close();
      } catch {
        /* ignore */
      }
    }, 1000);
  } catch {
    /* BroadcastChannel unsupported — storage event / polling cover it */
  }
}

/**
 * Listen for a Kite-connected signal. Calls `handler` at most once per ~second
 * (BroadcastChannel and the storage event can both fire for one login). Returns
 * an unsubscribe function. Safe to call outside the browser (no-op).
 */
export function subscribeKiteConnected(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let last = 0;
  const fire = () => {
    const now = Date.now();
    if (now - last < 1000) return; // de-dupe double-delivery
    last = now;
    handler();
  };

  // Recent-flag check on subscribe: covers the race where the login tab wrote
  // the flag just before this dashboard tab mounted its listener, and the
  // same-tab reload case (popup blocked → the connected page redirected here).
  try {
    const raw = window.localStorage.getItem(KITE_CONNECTED_KEY);
    if (raw) {
      const at = Number((JSON.parse(raw) as { at?: number })?.at) || 0;
      if (at > 0 && Date.now() - at < RECENT_MS) fire();
    }
  } catch {
    /* ignore malformed/disabled storage */
  }

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(KITE_CHANNEL);
    bc.onmessage = (e: MessageEvent) => {
      if ((e.data as KiteConnectedMessage | undefined)?.type === "kite-connected") fire();
    };
  } catch {
    bc = null;
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key === KITE_CONNECTED_KEY && e.newValue) fire();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("storage", onStorage);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}
