import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Share Market Analysis Tool",
  description:
    "Live read-only dashboard for Indian share market analysis (Equity, Futures, Options, Nifty, Bank Nifty, Fin Nifty) via Zerodha Kite. Advisory analysis only — no trade execution.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-density="compact">
      <head>
        {/* Design-system typeface pairing: Manrope (UI) + IBM Plex Mono
            (numerics). Loaded over a <link> (not next/font) so the static
            export builds with no build-time font fetch; preconnect keeps the
            runtime request fast and `display=swap` avoids invisible text. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
