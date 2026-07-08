"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsync } from "@/hooks/useAsync";
import { useKiteConnect } from "@/hooks/useKiteConnect";
import { api } from "@/lib/apiClient";
import type { KiteStatus } from "@/types/api";

/**
 * Zerodha Kite Connect — READ-ONLY status card (Phase 3A).
 *
 * Shows connection status, a "Connect / Login" button that opens the hosted
 * Kite login URL, and a read-only quote tester. There are intentionally NO
 * buy/sell buttons and NO order forms — this app does not place trades.
 */
export function KiteStatusCard() {
  const status = useAsync(api.kite.status);
  // Connect + auto-refresh: refreshes this card the moment login succeeds in the
  // other tab (cross-tab signal + bounded poll), no manual reload needed.
  const { connect, connecting, error: connectError } = useKiteConnect(() => void status.run());

  useEffect(() => {
    void status.run();
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = status.data;
  const accent = data ? (!data.liveDataEnabled ? "neutral" : data.configured && data.authenticated ? "bull" : "warn") : undefined;

  return (
    <Card
      id="kite-status"
      eyebrow="Data source"
      title="Live Data — Zerodha Kite"
      subtitle="Read-only market data · Phase 3A"
      accent={accent}
      action={data ? <StatusBadge status={data} /> : null}
    >
      {status.isLoading && !data && <p className="text-sm text-slate-500">Checking Kite status…</p>}

      {status.isError && (
        <ErrorState
          message={status.error ?? "Could not load Kite status."}
          hint="Make sure the backend is running on port 4000."
          onRetry={() => void status.run()}
        />
      )}

      {data && (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">{data.message}</p>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Flag label="Live data" on={data.liveDataEnabled} />
            <Flag label="Configured" on={data.configured} />
            <Flag label="Authenticated" on={data.authenticated} />
          </div>

          <ConnectButton status={data} connect={connect} connecting={connecting} error={connectError} />
          <QuoteTester enabled={data.liveDataEnabled && data.configured && data.authenticated} />

          {/* Explicit, non-negotiable read-only notice. */}
          <p className="rounded-md border border-neutralSignal/20 bg-neutralSignal-soft px-3 py-2 text-[11px] leading-relaxed text-neutralSignal">
            🔒 Read-only mode. Order placement, modification, cancellation, GTT, baskets and trade
            execution are disabled in this app. {data.notice ? "" : null}
          </p>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: KiteStatus }) {
  const connected = status.liveDataEnabled && status.configured && status.authenticated;
  const cls = !status.liveDataEnabled
    ? "border-white/10 bg-base-800 text-slate-400"
    : connected
      ? "border-bull/30 bg-bull-soft text-bull"
      : "border-neutralSignal/30 bg-neutralSignal-soft text-neutralSignal";
  const label = !status.liveDataEnabled ? "Disabled" : connected ? "Connected" : "Login required";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-800/60 px-2 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${on ? "text-bull" : "text-slate-500"}`}>{on ? "Yes" : "No"}</p>
    </div>
  );
}

function ConnectButton({ status, connect, connecting, error }: { status: KiteStatus; connect: () => void; connecting: boolean; error: string | null }) {
  // Nothing to connect to when disabled/unconfigured, or already authenticated.
  if (!status.liveDataEnabled || !status.configured) return null;
  if (status.authenticated) return null;

  return (
    <div>
      <button
        type="button"
        onClick={connect}
        disabled={connecting}
        className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/30 disabled:opacity-40"
      >
        {connecting ? "Opening…" : "Connect Kite (read-only login)"}
      </button>
      {error && <p className="mt-2 text-xs text-bear">{error}</p>}
      <p className="mt-2 text-[11px] text-slate-500">
        Opens Zerodha&apos;s official login in a new tab. After you authorise, this tab closes and the
        dashboard updates to <span className="text-bull">Connected</span> automatically — no manual refresh.
      </p>
    </div>
  );
}

function QuoteTester({ enabled }: { enabled: boolean }) {
  const [instrument, setInstrument] = useState("NSE:RELIANCE");
  const quote = useAsync(api.kite.quote);

  return (
    <div className="rounded-lg border border-white/5 bg-base-800/40 p-3">
      <p className="mb-2 text-xs font-medium text-slate-300">Read-only quote test</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          placeholder="NSE:RELIANCE"
          className="flex-1 rounded-lg border border-white/5 bg-base-900/60 px-3 py-2 text-sm text-slate-200 focus:border-accent/50 focus:outline-none"
          aria-label="Instrument (EXCHANGE:SYMBOL)"
        />
        <button
          type="button"
          onClick={() => void quote.run(instrument.trim())}
          disabled={!enabled || quote.isLoading || !instrument.trim()}
          className="rounded-lg border border-white/10 bg-base-800 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-base-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {quote.isLoading ? "Fetching…" : "Get quote"}
        </button>
      </div>

      {!enabled && (
        <p className="mt-2 text-[11px] text-slate-500">
          Enable live data, configure credentials and log in to fetch a live quote.
        </p>
      )}
      {quote.isError && <p className="mt-2 text-xs text-bear">{quote.error}</p>}
      {quote.isSuccess && quote.data && (
        <pre className="num mt-2 max-h-48 overflow-auto rounded-md bg-base-900/70 p-2 text-[11px] text-slate-300">
          {JSON.stringify(quote.data.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
