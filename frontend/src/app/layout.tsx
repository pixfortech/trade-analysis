import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Share Market Analysis Tool",
  description:
    "Premium dark-mode dashboard for AI-powered Indian share market analysis (Equity, Futures, Options, Nifty, Bank Nifty, Fin Nifty). Phase 1 — demo data only.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
