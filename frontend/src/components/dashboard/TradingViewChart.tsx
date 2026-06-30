"use client";

import { useEffect, useRef } from "react";

/**
 * TradingView Advanced Chart widget — read-only embed that brings the full
 * TradingView studies/indicators library (the ƒx "Indicators" button lets the
 * user apply unlimited indicators). This is an OPTIONAL view alongside the Kite
 * "levels" chart; it uses TradingView's own data feed (which may differ from
 * Kite) and overlays no order controls. Loaded client-side, so it's
 * static-export safe.
 */
export function TradingViewChart({ symbol, interval, theme, height = 460 }: { symbol: string; interval: string; theme: "dark" | "light"; height?: number }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !symbol) return;
    el.innerHTML = "";

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    container.style.width = "100%";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Asia/Kolkata",
      theme,
      style: "1",
      locale: "en",
      hide_side_toolbar: false, // keep the indicators / drawing toolbar
      allow_symbol_change: true, // user can correct/search the symbol
      withdateranges: true,
      calendar: false,
      studies: [],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);
    el.appendChild(container);

    return () => {
      el.innerHTML = "";
    };
  }, [symbol, interval, theme]);

  return <div ref={host} style={{ height, width: "100%" }} aria-label={`TradingView advanced chart for ${symbol}`} />;
}
