// Strategy modes (riskProfile) — the labels + explanations shown in the UI.
// These map 1:1 to the backend `riskProfile` param, which DOES influence the
// analysis: the backend's PROFILE table sets the stop-loss ATR multiplier and
// the target R-multiples per mode (conservative = wider stop / standard
// targets; aggressive = tighter stop / larger targets). So changing the mode
// genuinely changes the computed SL/targets and setup status.

export type StrategyMode = "conservative" | "balanced" | "aggressive";

export const STRATEGY_MODES: { value: StrategyMode; label: string; blurb: string }[] = [
  {
    value: "conservative",
    label: "Conservative",
    blurb: "Fewer, higher-conviction signals. Wider stop-loss buffer (1.5× ATR) and standard 1R/2R/3R targets. Lowest risk; best when you want stronger confirmation.",
  },
  {
    value: "balanced",
    label: "Balanced (default)",
    blurb: "Moderate confirmation with normal risk/reward. Stop ≈ 1× ATR, targets 1R/2R/3R. A sensible middle ground for most intraday trades.",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    blurb: "Earlier entries and faster reaction. Tighter stop (0.75× ATR) but larger targets (1.5R/3R/4.5R). Higher risk and more whipsaw — use small size.",
  },
];

export function modeBlurb(mode: string): string {
  return STRATEGY_MODES.find((m) => m.value === mode)?.blurb ?? "";
}
