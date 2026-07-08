// First-pass lexicon sentiment for financial headlines. Deterministic and
// explainable (returns the matched words as the reason). Not fabricated — it
// only classifies text that a news source actually published.

const POSITIVE = ["surge", "surges", "surged", "jump", "jumps", "jumped", "rally", "rallies", "gain", "gains", "gained", "rise", "rises", "soar", "soars", "record high", "beats", "beat", "profit", "profits", "upgrade", "upgraded", "bullish", "outperform", "boost", "boosts", "recovery", "rebound", "rebounds", "growth", "wins", "approval", "approved", "dividend", "bonus", "expands", "strong demand", "raises guidance", "buyback"];
const NEGATIVE = ["fall", "falls", "fell", "drop", "drops", "dropped", "plunge", "plunges", "plunged", "slump", "slumps", "crash", "crashes", "loss", "losses", "decline", "declines", "downgrade", "downgraded", "bearish", "underperform", "weak", "warning", "warns", "probe", "fraud", "ban", "bans", "layoff", "layoffs", "default", "defaults", "concern", "concerns", "fear", "fears", "recession", "scam", "penalty", "penalised", "cut", "cuts", "misses estimates", "profit falls"];
const HIGH_IMPACT = ["rbi", "fed", "fomc", "inflation", "gdp", "budget", "war", "crude", "oil price", "election", "repo rate", "rate hike", "rate cut", "sebi", "downgrade", "crash", "tariff", "sanction", "global selloff", "us fed", "recession", "default"];

const count = (hay: string, words: string[]): string[] => words.filter((w) => hay.includes(w));

export interface HeadlineScore {
  sentiment: "positive" | "negative" | "neutral";
  impact: "low" | "medium" | "high";
  reason: string;
  score: number; // signed keyword balance
}

export function scoreHeadline(title: string, description = ""): HeadlineScore {
  const hay = `${title} ${description}`.toLowerCase();
  const pos = count(hay, POSITIVE);
  const neg = count(hay, NEGATIVE);
  const macro = count(hay, HIGH_IMPACT);
  const score = pos.length - neg.length;
  const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  const mag = Math.abs(score);
  const impact: HeadlineScore["impact"] = macro.length >= 1 ? (mag >= 2 || macro.length >= 2 ? "high" : "medium") : mag >= 2 ? "medium" : "low";
  const bits: string[] = [];
  if (pos.length) bits.push(`positive: ${pos.slice(0, 3).join(", ")}`);
  if (neg.length) bits.push(`negative: ${neg.slice(0, 3).join(", ")}`);
  if (macro.length) bits.push(`macro: ${macro.slice(0, 2).join(", ")}`);
  const reason = bits.length ? bits.join(" · ") : "no strong sentiment keywords";
  return { sentiment, impact, reason, score };
}

const IMPACT_W: Record<HeadlineScore["impact"], number> = { low: 1, medium: 1.8, high: 3 };

/** Recency decay: 1.0 now → ~0 at decayHours. */
function recencyWeight(ageMinutes: number | null, decayHours: number): number {
  if (ageMinutes == null) return 0.5;
  const w = 1 - ageMinutes / (decayHours * 60);
  return Math.max(0, Math.min(1, w));
}

export interface SentimentAggregate {
  label: "positive" | "negative" | "neutral";
  stockScore: number; // weighted, symbol-specific
  marketScore: number; // weighted, all items
  strongNegative: boolean; // a high-impact negative item within window
  strongPositive: boolean;
  reasons: string[];
}

/** Aggregate scored items into stock- and market-level bias with decay. */
export function aggregateSentiment(items: { ageMinutes: number | null; matched?: string; score: HeadlineScore }[], decayHours: number): SentimentAggregate {
  let market = 0;
  let stock = 0;
  let strongNeg = false;
  let strongPos = false;
  const reasons: string[] = [];
  for (const it of items) {
    const w = recencyWeight(it.ageMinutes, decayHours) * IMPACT_W[it.score.impact];
    const contrib = it.score.score * w;
    market += contrib;
    if (it.matched) stock += contrib;
    if (it.score.sentiment === "negative" && it.score.impact !== "low" && recencyWeight(it.ageMinutes, decayHours) > 0.4) strongNeg = true;
    if (it.score.sentiment === "positive" && it.score.impact === "high" && recencyWeight(it.ageMinutes, decayHours) > 0.4) strongPos = true;
  }
  market = Math.round(market * 100) / 100;
  stock = Math.round(stock * 100) / 100;
  const basis = stock !== 0 ? stock : market;
  const label = basis > 0.5 ? "positive" : basis < -0.5 ? "negative" : "neutral";
  if (strongNeg) reasons.push("A recent high-impact negative headline is present — blocks fresh long unless price action confirms recovery.");
  if (strongPos) reasons.push("A recent high-impact positive headline supports the long side (needs price + volume confirmation).");
  return { label, stockScore: stock, marketScore: market, strongNegative: strongNeg, strongPositive: strongPos, reasons };
}
