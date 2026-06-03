"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useAsync } from "@/hooks/useAsync";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { api } from "@/lib/apiClient";
import { inr, num } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/Inputs";
import { useGlobalControls } from "@/hooks/useGlobalControls";
import { useAiVirtualTrades } from "@/lib/aiVirtualTrades";
import type { LiveSignal } from "@/types/api";

const RISK_PCTS = [0.25, 0.5, 1, 1.5, 2];

interface PlannerSettings {
  manualMode: boolean;
  capitalOverride: number | null;
  riskPercent: number;
  entryOverride: number | null;
  stopOverride: number | null;
  t1Override: number | null;
  t2Override: number | null;
  t3Override: number | null;
  lotSizeOverride: number | null;
  plannedSize: number | null; // lots (F&O) or qty (equity); null = use suggested
}

const DEFAULTS: PlannerSettings = {
  manualMode: false,
  capitalOverride: null,
  riskPercent: 1,
  entryOverride: null,
  stopOverride: null,
  t1Override: null,
  t2Override: null,
  t3Override: null,
  lotSizeOverride: null,
  plannedSize: null,
};

/** Reconcile stored settings against the default shape so no field is ever
 *  `undefined` (the old card rendered String(undefined) → "undefined"). */
function reconcile(s: Partial<PlannerSettings> | null | undefined): PlannerSettings {
  const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    manualMode: Boolean(s?.manualMode),
    capitalOverride: numOrNull(s?.capitalOverride),
    riskPercent: typeof s?.riskPercent === "number" && s.riskPercent > 0 ? s.riskPercent : DEFAULTS.riskPercent,
    entryOverride: numOrNull(s?.entryOverride),
    stopOverride: numOrNull(s?.stopOverride),
    t1Override: numOrNull(s?.t1Override),
    t2Override: numOrNull(s?.t2Override),
    t3Override: numOrNull(s?.t3Override),
    lotSizeOverride: numOrNull(s?.lotSizeOverride),
    plannedSize: numOrNull(s?.plannedSize),
  };
}

type Side = "long" | "short";

/**
 * Trade Size & Risk Planner — Phase 3M. Connects to the shared selected
 * instrument + live AI signal to plan a practical position size (lots/qty) from
 * capital, entry and stop-loss, with loss/profit projections and plain-language
 * explanations. Auto-fills from the signal; everything is overridable. Read-only.
 */
export function RiskManagementCard() {
  const g = useGlobalControls();
  const vt = useAiVirtualTrades();
  const sel = g.selectedInstrument;
  const { value: raw, setValue } = useLocalStorage<PlannerSettings>("risk.planner.v2", DEFAULTS);
  const s = useMemo(() => reconcile(raw), [raw]);
  const set = (patch: Partial<PlannerSettings>) => setValue((c) => reconcile({ ...reconcile(c), ...patch }));

  const account = useAsync(api.account.portfolioSummary);
  const signal = useAsync(api.liveSignal);

  useEffect(() => {
    void account.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live signal for the selected instrument; refresh while global live is ON.
  useEffect(() => {
    if (!sel?.instrument) return;
    void signal.run({ instrument: sel.instrument, interval: "15minute", riskProfile: "balanced" });
    if (!g.liveUpdates) return;
    const id = window.setInterval(() => void signal.run({ instrument: sel.instrument, interval: "15minute", riskProfile: "balanced" }), 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.instrument, g.liveUpdates]);

  // Guard against showing a previous instrument's data after switching scrips.
  const live: LiveSignal | null = signal.data && signal.data.instrument === sel?.instrument ? signal.data : null;
  const cmp = live?.currentPrice ?? null;

  // ---- capital ----
  const liveCapital = account.data?.source === "zerodha" ? account.data.availableCapital : null;
  const capital = s.capitalOverride ?? liveCapital ?? null;
  const capitalSource = s.capitalOverride != null ? "Manual capital" : liveCapital != null ? "Zerodha capital" : "Not set";

  // ---- AI-signal-derived entry / SL / targets (preferred side) ----
  const aiSide: Side = live ? (live.preferredSetup !== "none" ? (live.preferredSetup as Side) : live.finalDecision.action === "SHORT" ? "short" : "long") : "long";
  const aiSetup = live ? (aiSide === "short" ? live.shortSetup : live.longSetup) : null;
  const aiEntry = aiSetup ? (aiSide === "short" ? aiSetup.entryBelow ?? cmp : aiSetup.entryAbove ?? cmp) ?? null : null;
  const aiStop = aiSetup?.stopLoss ?? null;
  const aiT: [number | null, number | null, number | null] = [aiSetup?.target1 ?? null, aiSetup?.target2 ?? null, aiSetup?.target3 ?? null];

  const entry = s.entryOverride ?? aiEntry ?? null;
  const stop = s.stopOverride ?? aiStop ?? null;
  const targets: [number | null, number | null, number | null] = [s.t1Override ?? aiT[0], s.t2Override ?? aiT[1], s.t3Override ?? aiT[2]];
  const entrySrc = s.entryOverride != null ? "Manual" : aiEntry != null ? "AI signal" : null;
  const stopSrc = s.stopOverride != null ? "Manual" : aiStop != null ? "AI signal" : null;

  // ---- instrument type + lot size ----
  const itype = live?.resolvedInstrument.instrumentType?.toUpperCase() ?? "";
  const resolvedLot = live?.resolvedInstrument.lotSize ?? sel?.lotSize ?? null;
  const lotSize = s.lotSizeOverride ?? (resolvedLot && resolvedLot > 0 ? resolvedLot : null);
  const isFnO = ["FUT", "CE", "PE"].includes(itype) || (resolvedLot != null && resolvedLot > 1) || s.lotSizeOverride != null;
  const lotUnavailable = isFnO && (lotSize == null || lotSize <= 1);
  const effLot = isFnO ? (lotSize && lotSize > 0 ? lotSize : 1) : 1;

  // ---- core sizing math ----
  const plan = useMemo(
    () => computePlan({ capital, riskPercent: s.riskPercent, entry, stop, targets, isFnO, lotSize: effLot, side: aiSide, plannedSize: s.plannedSize }),
    [capital, s.riskPercent, entry, stop, targets, isFnO, effLot, aiSide, s.plannedSize],
  );

  // ---- active AI virtual trade for this instrument (position check) ----
  const openTrade = sel?.instrument ? vt.openForInstrument(sel.instrument)[0] ?? null : null;
  const posCheck = useMemo(() => {
    if (!openTrade || plan.riskPerTrade == null) return null;
    const long = openTrade.side === "LONG";
    const rpu = openTrade.stopLoss != null ? Math.abs(openTrade.entryPrice - openTrade.stopLoss) : null;
    const safeQty = rpu && rpu > 0 ? Math.floor(plan.riskPerTrade / rpu) : null;
    const pnlPerUnit = cmp != null ? (long ? cmp - openTrade.entryPrice : openTrade.entryPrice - cmp) : null;
    const pnlTotal = pnlPerUnit != null ? Math.round(pnlPerUnit * openTrade.quantity) : null;
    const within = safeQty != null ? openTrade.quantity <= safeQty : null;
    return { rpu, safeQty, pnlTotal, within };
  }, [openTrade, plan.riskPerTrade, cmp]);

  const riskTone = s.riskPercent <= 0.5 ? "bull" : s.riskPercent <= 1 ? "accent" : s.riskPercent <= 1.5 ? "amber" : "bear";

  return (
    <Card
      id="risk-management"
      title="Trade Size & Risk Planner"
      subtitle="Plan lots/qty from capital, entry, stop-loss and targets before entering"
      action={<span className="rounded-full border border-white/10 bg-base-800 px-3 py-1 text-[11px] font-medium text-slate-400">{capitalSource.toUpperCase()}</span>}
    >
      {/* ---------- Top summary ---------- */}
      <div className="rounded-xl border border-white/10 bg-base-800/50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{sel?.displayName ?? "No instrument"}</p>
            <p className="num truncate text-[11px] text-slate-500">
              {sel?.instrument}
              {itype ? ` · ${itype}` : ""}
              {live?.resolvedInstrument.expiry ? ` · exp ${live.resolvedInstrument.expiry}` : ""}
              {live && live.resolvedInstrument.strike > 0 ? ` · ${num(live.resolvedInstrument.strike, 0)} ${live.resolvedInstrument.optionType}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="num text-xl font-bold text-slate-100">{cmp == null ? "—" : num(cmp)}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">CMP {live ? "· Zerodha live" : signal.isLoading ? "· loading" : "· unavailable"}</p>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center sm:grid-cols-6">
          <Sum label="Entry" value={entry} />
          <Sum label="Stop-loss" value={stop} tone="bear" />
          <Sum label="Target 1" value={targets[0]} tone="bull" />
          <Sum label="Risk/unit" value={plan.riskPerUnit} />
          <Sum label="Risk/trade" value={plan.riskPerTrade} money />
          <Sum label={isFnO ? "Suggested" : "Sugg. qty"} value={null} text={suggestedText(plan, isFnO)} tone="accent" />
        </div>
      </div>

      {/* ---------- empty / unavailable hints ---------- */}
      {!live && !signal.isLoading && (
        <p className="mt-3 rounded-lg border border-neutralSignal/30 bg-neutralSignal-soft px-3 py-2 text-xs text-neutralSignal">
          No live AI signal for <strong>{sel?.displayName}</strong> yet (needs Kite authorised). You can still plan in <strong>Manual mode</strong> below.
        </p>
      )}

      {/* ---------- Step 1: Capital ---------- */}
      <Step n={1} title="Capital" hint="The money you're trading with.">
        <div className="flex flex-wrap items-center gap-2">
          <p className="num text-lg font-bold text-slate-100">{capital == null ? "Enter capital" : inr(capital)}</p>
          <span className="rounded border border-white/10 bg-base-800 px-1.5 py-0.5 text-[10px] text-slate-400">{capitalSource}</span>
          {liveCapital != null && s.capitalOverride != null && (
            <button type="button" onClick={() => set({ capitalOverride: null })} className="text-[11px] text-accent hover:underline">Use Zerodha capital</button>
          )}
          <NumField compact placeholder={liveCapital != null ? "override ₹" : "your capital ₹"} value={s.capitalOverride} onCommit={(v) => set({ capitalOverride: v })} />
        </div>
      </Step>

      {/* ---------- Step 2: Risk limit ---------- */}
      <Step n={2} title="Risk limit" hint="Maximum you allow yourself to lose if the stop-loss hits.">
        <div className="flex flex-wrap gap-1.5">
          {RISK_PCTS.map((p) => (
            <button key={p} type="button" onClick={() => set({ riskPercent: p })}
              className={`rounded-lg border px-2.5 py-1 text-sm font-medium transition-colors ${s.riskPercent === p ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 bg-base-800/60 text-slate-400 hover:text-slate-200"}`}>
              {p}%
            </button>
          ))}
          <NumField compact placeholder="custom %" value={RISK_PCTS.includes(s.riskPercent) ? null : s.riskPercent} onCommit={(v) => v && v > 0 && set({ riskPercent: v })} />
        </div>
        <div className={`mt-2 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${toneCls(riskTone)}`}>
          <span>Risk / trade = Capital × {s.riskPercent}%</span>
          <span className="num font-bold">{plan.riskPerTrade == null ? "—" : inr(plan.riskPerTrade)}</span>
        </div>
        {s.riskPercent > 1.5 && <p className="mt-1 text-[11px] text-bear">⚠️ Risking &gt;1.5% per trade can draw down capital fast — consider reducing.</p>}
      </Step>

      {/* ---------- Step 3: Entry & Stop-loss ---------- */}
      <Step
        n={3}
        title="Entry & Stop-loss"
        hint="Risk/unit is the distance between entry and stop-loss — the loss per share/point."
        right={
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input type="checkbox" checked={s.manualMode} onChange={(e) => set({ manualMode: e.target.checked })} className="accent-accent" />
            Manual mode
          </label>
        }
      >
        {s.manualMode ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumField label="Entry" value={s.entryOverride} onCommit={(v) => set({ entryOverride: v })} placeholder={aiEntry != null ? String(aiEntry) : "price"} />
            <NumField label="Stop-loss" value={s.stopOverride} onCommit={(v) => set({ stopOverride: v })} placeholder={aiStop != null ? String(aiStop) : "price"} />
            <NumField label="Lot size" value={s.lotSizeOverride} onCommit={(v) => set({ lotSizeOverride: v })} placeholder={resolvedLot ? String(resolvedLot) : "1"} />
            <NumField label="Target 1" value={s.t1Override} onCommit={(v) => set({ t1Override: v })} placeholder={aiT[0] != null ? String(aiT[0]) : "price"} />
            <NumField label="Target 2" value={s.t2Override} onCommit={(v) => set({ t2Override: v })} placeholder={aiT[1] != null ? String(aiT[1]) : "price"} />
            <NumField label="Target 3" value={s.t3Override} onCommit={(v) => set({ t3Override: v })} placeholder={aiT[2] != null ? String(aiT[2]) : "price"} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <Sum label="Entry" value={entry} tag={entrySrc} />
            <Sum label="Stop-loss" value={stop} tone="bear" tag={stopSrc} />
            <Sum label="Risk/unit" value={plan.riskPerUnit} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {cmp != null && <button type="button" onClick={() => set({ entryOverride: cmp })} className="rounded border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5">Use CMP as entry</button>}
          {(s.entryOverride != null || s.stopOverride != null || s.t1Override != null || s.t2Override != null || s.t3Override != null) && aiEntry != null && (
            <button type="button" onClick={() => set({ entryOverride: null, stopOverride: null, t1Override: null, t2Override: null, t3Override: null })} className="rounded border border-white/10 px-2 py-1 text-accent hover:bg-white/5">Use AI signal values</button>
          )}
        </div>
        {plan.slWrongSide && <p className="mt-1.5 text-[11px] text-bear">⚠️ Stop-loss is on the wrong side of entry for a {aiSide.toUpperCase()} trade. Check your levels.</p>}
        {plan.riskPerUnit == null && <p className="mt-1.5 text-[11px] text-neutralSignal">Enter a valid entry and stop-loss to size the trade.</p>}
      </Step>

      {/* ---------- Step 4: Lot calculation ---------- */}
      <Step n={4} title="Suggested size" hint="The biggest size that keeps your loss within the risk limit if the stop hits.">
        {lotUnavailable && (
          <p className="mb-2 rounded border border-neutralSignal/30 bg-neutralSignal-soft px-2 py-1 text-[11px] text-neutralSignal">Lot size unavailable — enter it manually in Manual mode.</p>
        )}
        {plan.suggestedQty != null && plan.suggestedQty >= (isFnO ? effLot : 1) ? (
          <>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Sum label="Max qty" value={plan.maxQuantity} text={plan.maxQuantity == null ? "—" : num(plan.maxQuantity, 0)} />
              {isFnO && <Sum label="Lot size" value={effLot} text={num(effLot, 0)} />}
              {isFnO && <Sum label="Practical lots" value={plan.suggestedLots} text={plan.suggestedLots == null ? "—" : `${num(plan.suggestedLots, 0)} lot`} tone="accent" />}
              <Sum label="Trade qty" value={plan.suggestedQty} text={num(plan.suggestedQty, 0)} tone="accent" />
            </div>
            <p className="mt-2 rounded-lg border border-bull/20 bg-bull-soft px-3 py-2 text-xs text-bull">
              ✅ Suggested: <strong>{suggestedText(plan, isFnO)}</strong> — max loss ≈ <strong>{plan.maxLoss == null ? "—" : inr(plan.maxLoss)}</strong> if the stop hits.
            </p>
          </>
        ) : (
          plan.riskPerUnit != null && (
            <p className="rounded-lg border border-bear/30 bg-bear-soft px-3 py-2 text-xs text-bear">
              Risk too high or stop-loss too wide for {s.riskPercent}% on this capital{isFnO ? " and lot size" : ""}. Increase capital/risk%, tighten the stop, or reduce lot size — suggested size is below one {isFnO ? "lot" : "share"}.
            </p>
          )
        )}
      </Step>

      {/* ---------- Step 5: Profit/Loss estimate ---------- */}
      <Step n={5} title="Profit / Loss estimate" hint="For your planned size, at the stop and at each target.">
        {plan.suggestedQty != null && plan.suggestedQty > 0 ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-base-800/60 px-3 py-1.5">
              <span className="text-[11px] text-slate-400">Planned size</span>
              <div className="flex items-center gap-2">
                <Stepper value={plan.plannedLots ?? plan.plannedQty} onDec={() => set({ plannedSize: Math.max(0, (s.plannedSize ?? defaultPlanned(plan, isFnO)) - 1) })} onInc={() => set({ plannedSize: (s.plannedSize ?? defaultPlanned(plan, isFnO)) + 1 })} />
                <span className="num text-xs font-semibold text-slate-200">{isFnO ? `${num(plan.plannedLots ?? 0, 0)} lot · ${num(plan.plannedQty, 0)} qty` : `${num(plan.plannedQty, 0)} qty`}</span>
                {s.plannedSize != null && <button type="button" onClick={() => set({ plannedSize: null })} className="text-[10px] text-accent hover:underline">reset</button>}
              </div>
            </div>
            {plan.exceedsLimit && <p className="mb-2 text-[11px] font-semibold text-bear">⚠️ This exceeds your risk limit — loss at SL would be more than {inr(plan.riskPerTrade ?? 0)}.</p>}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Proj label="Loss at SL" value={plan.maxLoss == null ? "—" : `−${num(plan.maxLoss)}`} tone="bear" />
              {plan.targets.map((t, i) => (
                <Proj key={i} label={`Profit @ T${i + 1}`} value={t.profit == null ? "—" : `+${num(t.profit)}`} sub={t.rr == null ? undefined : `1:${t.rr.toFixed(2)}`} tone="bull" />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              R:R to T1 ≈ <span className="num text-slate-300">{plan.targets[0].rr == null ? "—" : `1:${plan.targets[0].rr.toFixed(2)}`}</span>
              {plan.targets[0].rr != null && plan.targets[0].rr < 1.5 ? " — below 1:1.5 is generally not worth the risk." : " — 1:1.5 or better is preferable."}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500">Size the trade above to see loss/profit estimates.</p>
        )}
      </Step>

      {/* ---------- Active position check (AI Virtual Trade) ---------- */}
      {openTrade && posCheck && (
        <div className={`mt-3 rounded-xl border px-3 py-2.5 ${posCheck.within === false ? "border-bear/40 bg-bear-soft" : "border-bull/30 bg-bull-soft"}`}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-100">Your position (AI virtual)</span>
            <span className="text-[10px] text-slate-500">{openTrade.side} {num(openTrade.quantity, 0)} @ ₹{num(openTrade.entryPrice)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {posCheck.pnlTotal != null && <span className={posCheck.pnlTotal >= 0 ? "text-bull" : "text-bear"}>Live P/L {posCheck.pnlTotal >= 0 ? "+" : ""}₹{num(posCheck.pnlTotal)}</span>}
            {posCheck.safeQty != null && <span className="text-slate-400">Safe size at {s.riskPercent}%: {num(posCheck.safeQty, 0)} qty</span>}
          </div>
          <p className={`mt-1 text-[11px] font-semibold ${posCheck.within === false ? "text-bear" : "text-bull"}`}>
            {posCheck.within == null ? "Add a stop-loss to this trade to assess size." : posCheck.within ? "✅ Position size is within your risk limit." : "⚠️ Position exceeds your risk limit — reduce size or tighten the stop."}
          </p>
        </div>
      )}

      {/* ---------- Calculation details + glossary ---------- */}
      <Collapsible title="Show calculation">
        <ul className="space-y-1 text-[11px] text-slate-400">
          <Calc label="Risk / trade" expr={`${capital == null ? "—" : inr(capital)} × ${s.riskPercent}%`} val={plan.riskPerTrade == null ? "—" : inr(plan.riskPerTrade)} />
          <Calc label="Risk / unit" expr={entry != null && stop != null ? `|${num(entry)} − ${num(stop)}|` : "—"} val={plan.riskPerUnit == null ? "—" : num(plan.riskPerUnit)} />
          <Calc label="Max quantity" expr="Risk/trade ÷ Risk/unit" val={plan.maxQuantity == null ? "—" : num(plan.maxQuantity, 0)} />
          {isFnO && <Calc label="Practical lots" expr={`floor(Max qty ÷ ${num(effLot, 0)})`} val={plan.suggestedLots == null ? "—" : num(plan.suggestedLots, 0)} />}
          <Calc label="Trade qty" expr={isFnO ? `Lots × ${num(effLot, 0)}` : "= Max qty"} val={plan.suggestedQty == null ? "—" : num(plan.suggestedQty, 0)} />
          <Calc label="Max loss" expr="Trade qty × Risk/unit" val={plan.maxLoss == null ? "—" : inr(plan.maxLoss)} />
        </ul>
      </Collapsible>

      <Collapsible title="What does this mean?">
        <dl className="space-y-1.5 text-[11px] leading-relaxed text-slate-400">
          <Def t="Risk / trade">Maximum amount you're ready to lose on this trade if the stop-loss hits.</Def>
          <Def t="Risk / unit">Difference between entry and stop-loss, per share (equity) or point (F&O).</Def>
          <Def t="Suggested size">Largest quantity/lots you can take while staying within your risk limit.</Def>
          <Def t="Lot size">Number of units in one futures/options lot (1 for equity).</Def>
          <Def t="Risk : Reward">How much reward is possible compared with the risk taken (higher is better).</Def>
        </dl>
      </Collapsible>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        Advisory position-sizing only — not a recommendation to trade and no orders are placed. Capital source: {capitalSource}. Live data via Zerodha Kite.
      </p>
    </Card>
  );
}

// =============================== sizing math ===============================

interface PlanInputs {
  capital: number | null;
  riskPercent: number;
  entry: number | null;
  stop: number | null;
  targets: [number | null, number | null, number | null];
  isFnO: boolean;
  lotSize: number;
  side: Side;
  plannedSize: number | null;
}
interface PlanResult {
  riskPerTrade: number | null;
  riskPerUnit: number | null;
  maxQuantity: number | null;
  suggestedLots: number | null;
  suggestedQty: number | null;
  plannedQty: number;
  plannedLots: number | null;
  maxLoss: number | null;
  targets: { distance: number | null; profit: number | null; rr: number | null }[];
  slWrongSide: boolean;
  exceedsLimit: boolean;
}

function computePlan(i: PlanInputs): PlanResult {
  const riskPerTrade = i.capital != null && i.capital > 0 ? Math.round(((i.capital * i.riskPercent) / 100) * 100) / 100 : null;
  const riskPerUnit = i.entry != null && i.stop != null && Math.abs(i.entry - i.stop) > 0 ? Math.round(Math.abs(i.entry - i.stop) * 100) / 100 : null;
  const slWrongSide = i.entry != null && i.stop != null ? (i.side === "long" ? i.stop > i.entry : i.stop < i.entry) : false;

  const maxQuantity = riskPerTrade != null && riskPerUnit != null && riskPerUnit > 0 ? Math.floor(riskPerTrade / riskPerUnit) : null;
  let suggestedLots: number | null = null;
  let suggestedQty: number | null = null;
  if (maxQuantity != null) {
    if (i.isFnO) {
      suggestedLots = i.lotSize > 0 ? Math.floor(maxQuantity / i.lotSize) : null;
      suggestedQty = suggestedLots != null ? suggestedLots * i.lotSize : null;
    } else {
      suggestedQty = maxQuantity;
    }
  }

  // planned size (default = suggested)
  const defLots = i.isFnO ? suggestedLots ?? 0 : suggestedQty ?? 0;
  const chosen = i.plannedSize != null ? Math.max(0, Math.round(i.plannedSize)) : defLots;
  const plannedLots = i.isFnO ? chosen : null;
  const plannedQty = i.isFnO ? chosen * i.lotSize : chosen;

  const maxLoss = riskPerUnit != null ? Math.round(plannedQty * riskPerUnit) : null;
  const targets = i.targets.map((t) => {
    const distance = t != null && i.entry != null ? Math.round(Math.abs(t - i.entry) * 100) / 100 : null;
    const profit = distance != null ? Math.round(plannedQty * distance) : null;
    const rr = distance != null && riskPerUnit != null && riskPerUnit > 0 ? distance / riskPerUnit : null;
    return { distance, profit, rr };
  });
  const exceedsLimit = riskPerTrade != null && maxLoss != null && maxLoss > riskPerTrade + 1;

  return { riskPerTrade, riskPerUnit, maxQuantity, suggestedLots, suggestedQty, plannedQty, plannedLots, maxLoss, targets, slWrongSide, exceedsLimit };
}

function defaultPlanned(plan: PlanResult, isFnO: boolean): number {
  return isFnO ? plan.suggestedLots ?? 0 : plan.suggestedQty ?? 0;
}
function suggestedText(plan: PlanResult, isFnO: boolean): string {
  if (plan.suggestedQty == null) return "—";
  if (isFnO) return plan.suggestedLots == null ? "—" : `${num(plan.suggestedLots, 0)} lot · ${num(plan.suggestedQty, 0)} qty`;
  return `${num(plan.suggestedQty, 0)} qty`;
}

// ================================ UI bits ==================================

function toneCls(tone: "bull" | "accent" | "amber" | "bear"): string {
  return tone === "bull"
    ? "border-bull/30 bg-bull-soft text-bull"
    : tone === "accent"
      ? "border-accent/30 bg-accent/10 text-accent"
      : tone === "amber"
        ? "border-neutralSignal/30 bg-neutralSignal-soft text-neutralSignal"
        : "border-bear/40 bg-bear-soft text-bear";
}

function Sum({ label, value, text, tone, money, tag }: { label: string; value: number | null; text?: string; tone?: "bull" | "bear" | "accent"; money?: boolean; tag?: string | null }) {
  const c = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "accent" ? "text-accent" : "text-slate-100";
  const display = text != null ? text : value == null ? "—" : money ? inr(value) : num(value);
  return (
    <div className="rounded-md border border-white/10 bg-base-800/60 px-1.5 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`num text-xs font-bold ${value == null && text == null ? "text-slate-500" : c}`}>{display}</p>
      {tag && <p className="text-[9px] text-slate-500">{tag}</p>}
    </div>
  );
}

function Step({ n, title, hint, right, children }: { n: number; title: string; hint: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-white/5 bg-base-800/30 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">{n}</span>
          <div>
            <p className="text-xs font-semibold text-slate-200">{title}</p>
            <p className="text-[10px] leading-snug text-slate-500">{hint}</p>
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Proj({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "bull" | "bear" }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${tone === "bull" ? "border-bull/20 bg-bull-soft" : "border-bear/20 bg-bear-soft"}`}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`num text-sm font-bold ${tone === "bull" ? "text-bull" : "text-bear"}`}>{value}</p>
      {sub && <p className="num text-[10px] text-slate-500">R:R {sub}</p>}
    </div>
  );
}

function Stepper({ value, onDec, onInc }: { value: number | null; onDec: () => void; onInc: () => void }) {
  void value;
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-white/10">
      <button type="button" onClick={onDec} className="px-2 py-0.5 text-sm text-slate-300 hover:bg-white/10">−</button>
      <button type="button" onClick={onInc} className="border-l border-white/10 px-2 py-0.5 text-sm text-slate-300 hover:bg-white/10">+</button>
    </span>
  );
}

function NumField({ label, value, onCommit, placeholder, compact }: { label?: string; value: number | null; onCommit: (v: number | null) => void; placeholder?: string; compact?: boolean }) {
  const [v, setV] = useState(value == null ? "" : String(value));
  useEffect(() => setV(value == null ? "" : String(value)), [value]);
  const input = (
    <input
      value={v}
      placeholder={placeholder}
      inputMode="decimal"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v.trim() === "" ? null : Number(v))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`rounded-lg border border-white/10 bg-base-800/60 px-2.5 py-1.5 text-sm text-slate-200 focus:border-accent/50 focus:outline-none ${compact ? "w-28" : "w-full"}`}
    />
  );
  if (!label) return input;
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-slate-500">{label}</span>
      {input}
    </label>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-white/5 bg-base-800/40">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300">
        {title}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Calc({ label, expr, val }: { label: string; expr: string; val: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span><span className="text-slate-300">{label}</span> <span className="num text-slate-500">= {expr}</span></span>
      <span className="num font-semibold text-slate-200">{val}</span>
    </li>
  );
}

function Def({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline font-semibold text-slate-200">{t}: </dt>
      <dd className="inline">{children}</dd>
    </div>
  );
}
