import { DsCard, DsBadge } from "@/components/terminal/ds";
import { optionsSummary as o } from "@/lib/mockData";
import { compact, num } from "@/lib/format";

/**
 * Options chain — design OptionsChainScreen layout (analytics rail + CE / strike
 * / PE table with OI bars and ATM highlight). Built on the bundled sample
 * snapshot (clearly badged) until a live options-chain feed is wired.
 */
export function OptionsAnalysis() {
  const maxOI = Math.max(...o.chain.flatMap((s) => [s.callOI, s.putOI]));
  const atm = o.chain.find((s) => s.isATM)?.strike ?? o.maxPain;
  const pcrTone = o.pcr < 1 ? "enter" : "exit";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* analytics rail */}
      <DsCard
        eyebrow="Chain analytics"
        title={`${o.symbol} · ${o.expiry}`}
        headerRight={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <DsBadge tone="brand" dot>Spot {num(o.spot, 0)}</DsBadge>
            <DsBadge tone="neutral">Sample</DsBadge>
          </span>
        }
      >
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Stat label="PCR" value={o.pcr.toFixed(2)} tone={pcrTone} />
          <Stat label="Max pain" value={num(o.maxPain, 0)} />
          <Stat label="ATM strike" value={num(atm, 0)} tone="wait" />
          <Stat label="Support" value={o.support.map((s) => num(s, 0)).join(" · ")} tone="enter" />
          <Stat label="Resistance" value={o.resistance.map((s) => num(s, 0)).join(" · ")} tone="exit" />
        </div>
      </DsCard>

      {/* chain table */}
      <DsCard padding="none" eyebrow="Option chain" title="Strikes — CE / PE" headerRight={<span style={{ fontSize: 11, color: "var(--ink-3)" }}>OI snapshot · max ≈ {compact(maxOI)}</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", alignItems: "center", padding: "10px 18px", background: "var(--surface-sunken)", borderBottom: "1px solid var(--border-1)" }}>
          <span className="eyebrow" style={{ textAlign: "left" }}>Calls (CE) · OI</span>
          <span className="eyebrow" style={{ textAlign: "center" }}>Strike</span>
          <span className="eyebrow" style={{ textAlign: "right" }}>Puts (PE) · OI</span>
        </div>
        {o.chain.map((r) => {
          const isAtm = r.strike === atm;
          return (
            <div key={r.strike} style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid var(--border-1)", background: isAtm ? "var(--brand-50)" : "transparent", position: "relative" }}>
              {/* CE leg — bar anchored right */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-start", paddingRight: 6 }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${(r.callOI / maxOI) * 100}%`, background: "var(--action-enter-soft)", borderRadius: 3, zIndex: 0 }} />
                <span className="num" style={{ position: "relative", zIndex: 1, fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>{compact(r.callOI)}</span>
              </div>
              <div style={{ textAlign: "center" }}>
                <span className="num" style={{ fontSize: 15, fontWeight: 800, color: isAtm ? "var(--brand-600)" : "var(--ink-1)" }}>{num(r.strike, 0)}</span>
                {isAtm && <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", color: "var(--brand-600)" }}>ATM</div>}
              </div>
              {/* PE leg — bar anchored left */}
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingLeft: 6 }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${(r.putOI / maxOI) * 100}%`, background: "var(--action-exit-soft)", borderRadius: 3, zIndex: 0 }} />
                <span className="num" style={{ position: "relative", zIndex: 1, fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>{compact(r.putOI)}</span>
              </div>
            </div>
          );
        })}
      </DsCard>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "enter" | "exit" | "wait" }) {
  const c = tone === "enter" ? "var(--action-enter)" : tone === "exit" ? "var(--action-exit)" : tone === "wait" ? "var(--action-wait)" : "var(--ink-1)";
  return (
    <div style={{ minWidth: 92 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div className="num" style={{ fontSize: 18, fontWeight: 800, color: c }}>{value}</div>
    </div>
  );
}
