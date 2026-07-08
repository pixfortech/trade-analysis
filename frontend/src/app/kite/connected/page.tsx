"use client";

import { useEffect, useState } from "react";
import { publishKiteConnected } from "@/lib/kiteAuth";

// Landing page for the Kite login tab AFTER the backend callback exchanges the
// token. It runs on the SAME origin as the dashboard, so it can signal the
// dashboard tab (BroadcastChannel + localStorage) to refresh, then auto-close.
// If the browser blocks window.close(), it shows a "Return to Dashboard" button
// and auto-redirects to the dashboard. Read-only: no trade actions here.

type Outcome = "success" | "error";

export default function KiteConnectedPage() {
  const [outcome, setOutcome] = useState<Outcome>("success");
  const [reason, setReason] = useState<string | null>(null);
  // Once true, auto-close was attempted but the tab is still open → show fallback.
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result: Outcome = params.get("status") === "error" ? "error" : "success";
    setReason(params.get("reason"));
    setOutcome(result);

    if (result !== "success") {
      // Leave the message on screen so the user can read it; offer the button.
      setShowFallback(true);
      return;
    }

    // Tell the dashboard (any open tab, same origin) that Kite is connected.
    publishKiteConnected();

    const timers: number[] = [];
    // Give the signal a beat to propagate, then try to close this tab.
    timers.push(
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore — handled by the fallback below */
        }
        // If still open shortly after, the browser blocked the close → fall back
        // to a visible button plus an auto-redirect to the dashboard.
        timers.push(
          window.setTimeout(() => {
            if (!window.closed) {
              setShowFallback(true);
              timers.push(
                window.setTimeout(() => {
                  try {
                    window.location.replace("/");
                  } catch {
                    /* ignore */
                  }
                }, 1500),
              );
            }
          }, 500),
        );
      }, 700),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const success = outcome === "success";
  const accent = success ? "#2bd48f" : "#f7a957";

  return (
    <div style={styles.wrap}>
      <main style={styles.card}>
        <div style={{ ...styles.badge, background: success ? "rgba(43,212,143,.12)" : "rgba(247,169,87,.12)", color: accent }}>
          {success ? "✓" : "⚠"}
        </div>
        <h1 style={{ ...styles.h1, color: accent }}>{success ? "Kite connected" : "Kite connection failed"}</h1>
        <p style={styles.p}>
          {success
            ? showFallback
              ? "You're connected (read-only). You can return to your dashboard — it has already updated."
              : "Read-only access authorised. Returning you to the dashboard…"
            : reason || "We couldn't complete the Kite login. Please return to the dashboard and try connecting again."}
        </p>

        {(showFallback || !success) && (
          <a href="/" style={styles.btn}>
            Return to Dashboard
          </a>
        )}

        <div style={styles.ro}>Read-only market-data access · No order placement, modification or execution.</div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0a0e17" },
  card: { maxWidth: 420, width: "100%", background: "#111726", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "28px 26px", textAlign: "center", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  badge: { width: 44, height: 44, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, marginBottom: 14 },
  h1: { fontSize: 18, fontWeight: 800, margin: "0 0 8px" },
  p: { fontSize: 14, lineHeight: 1.5, color: "#9aa5b8", margin: "0 0 20px" },
  btn: { display: "inline-block", background: "#2f6fed", color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: 14, padding: "10px 20px", borderRadius: 9 },
  ro: { marginTop: 18, fontSize: 11, color: "#5d6b82", lineHeight: 1.4 },
};
