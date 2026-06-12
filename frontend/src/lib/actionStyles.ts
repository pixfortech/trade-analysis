// Central action-state styling — one source of truth for the cockpit's action
// colours. The Live Signal badge, the Locked Trade Plan panel, and the floating
// AI assistant borders all read the same ENTER / EXIT / WAIT / AVOID language so
// a glance at colour tells you the state everywhere.
//
// Tones line up 1:1 with PlanTone (bull / bear / warn / info / neutral), so an
// evaluated plan's `tone` can be passed straight in.

export type ActionTone = "bull" | "bear" | "warn" | "info" | "neutral";

export interface ToneVisual {
  /** Solid text colour. */
  text: string;
  /** Soft tinted background. */
  soft: string;
  /** Border at chip strength. */
  border: string;
  /** Full chip: border + soft bg + text. */
  chip: string;
  /** Elevation ring (floating windows / approved actions). */
  ring: string;
  /** Small status dot. */
  dot: string;
  /** Left accent strip / progress fill. */
  bar: string;
}

const MAP: Record<ActionTone, ToneVisual> = {
  bull: {
    text: "text-bull",
    soft: "bg-bull-soft",
    border: "border-bull/45",
    chip: "border-bull/45 bg-bull-soft text-bull",
    ring: "ring-bull/40",
    dot: "bg-bull",
    bar: "bg-bull",
  },
  bear: {
    text: "text-bear",
    soft: "bg-bear-soft",
    border: "border-bear/45",
    chip: "border-bear/45 bg-bear-soft text-bear",
    ring: "ring-bear/40",
    dot: "bg-bear",
    bar: "bg-bear",
  },
  warn: {
    text: "text-neutralSignal",
    soft: "bg-neutralSignal-soft",
    border: "border-neutralSignal/45",
    chip: "border-neutralSignal/45 bg-neutralSignal-soft text-neutralSignal",
    ring: "ring-neutralSignal/40",
    dot: "bg-neutralSignal",
    bar: "bg-neutralSignal",
  },
  info: {
    text: "text-accent",
    soft: "bg-accent/10",
    border: "border-accent/45",
    chip: "border-accent/45 bg-accent/10 text-accent",
    ring: "ring-accent/40",
    dot: "bg-accent",
    bar: "bg-accent",
  },
  neutral: {
    text: "text-slate-300",
    soft: "bg-base-800",
    border: "border-white/12",
    chip: "border-white/12 bg-base-800 text-slate-300",
    ring: "ring-white/10",
    dot: "bg-slate-500",
    bar: "bg-slate-600",
  },
};

/** Class bundle for an action tone (accepts PlanTone — same union). */
export function toneVisual(tone: ActionTone): ToneVisual {
  return MAP[tone] ?? MAP.neutral;
}

/** Map a discrete advisory action (LONG / SHORT / WAIT / AVOID) to a tone. */
export function actionToneFor(action: string): ActionTone {
  switch (action) {
    case "LONG":
      return "bull";
    case "SHORT":
    case "AVOID":
      return "bear";
    case "WAIT":
      return "warn";
    default:
      return "neutral";
  }
}
