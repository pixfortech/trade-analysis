"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Cockpit modules the user can show/hide. Hidden modules are never rendered, but
// nothing is deleted — re-enabling restores them. Choices persist in localStorage.
export type ModuleId =
  | "liveSignal"
  | "marketMovers"
  | "watchlist"
  | "riskPlanner"
  | "paperTrade"
  | "positionManager"
  | "floatingAssistants"
  | "indicesBreadth"
  | "optionsChain"
  | "futures"
  | "kiteStatus"
  | "accountSummary"
  | "globalControls";

export const MODULES: { id: ModuleId; label: string; desc: string }[] = [
  { id: "liveSignal", label: "Live Market Signal", desc: "Primary advisory signal + locked trade plan" },
  { id: "marketMovers", label: "Market Movers", desc: "Top gainers & losers (live)" },
  { id: "watchlist", label: "Watchlist", desc: "Tracked instruments rail" },
  { id: "riskPlanner", label: "Risk / Trade Size Planner", desc: "Position-sizing calculator" },
  { id: "paperTrade", label: "Paper Trade", desc: "Manual trade tracker" },
  { id: "positionManager", label: "AI Virtual Trade / Position Manager", desc: "Active trade monitor" },
  { id: "floatingAssistants", label: "Floating AI Assistants", desc: "Per-instrument floating windows" },
  { id: "indicesBreadth", label: "Indices / Breadth", desc: "Indices status strip + overview" },
  { id: "optionsChain", label: "Options Chain", desc: "Strikes, OI, PCR & max pain" },
  { id: "futures", label: "Futures Analysis", desc: "Basis & OI build-up" },
  { id: "kiteStatus", label: "Kite Status card", desc: "Connection status & quote tester" },
  { id: "accountSummary", label: "Account Summary", desc: "Funds, holdings & positions" },
  { id: "globalControls", label: "Global controls", desc: "Live updates, alerts & font size" },
];

const KEY = "cockpit.modules.v1";
type State = Partial<Record<ModuleId, boolean>>;

interface ModulesContext {
  isOn: (id: ModuleId) => boolean;
  setModule: (id: ModuleId, on: boolean) => void;
  reset: () => void;
}

const Ctx = createContext<ModulesContext | null>(null);

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const [modules, setModules] = useState<State>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setModules(JSON.parse(raw) as State);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: State) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const setModule = useCallback((id: ModuleId, on: boolean) => {
    setModules((cur) => {
      const next = { ...cur, [id]: on };
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setModules({});
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Default ON: a module is hidden only when explicitly set to false. This also
  // keeps SSR/first-client render identical (all on) → no hydration mismatch.
  const isOn = useCallback((id: ModuleId) => modules[id] !== false, [modules]);

  return <Ctx.Provider value={{ isOn, setModule, reset }}>{children}</Ctx.Provider>;
}

export function useModules(): ModulesContext {
  const ctx = useContext(Ctx);
  if (!ctx) return { isOn: () => true, setModule: () => {}, reset: () => {} };
  return ctx;
}
