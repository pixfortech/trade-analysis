// First-pass lexicon sentiment for financial headlines. Dictionaries, impact
// thresholds/weights and recency-decay come from intelConfig.news (env-
// overridable). Deterministic and explainable — only classifies text a source
// actually published (never fabricated).

import { intelConfig } from "../config/intelligence.config";

const count = (hay: string, words: string[]): string[] => words.filter((w) => hay.includes(w));

export interface HeadlineScore {
  sentiment: "positive" | "negative" | "neutral";
  impact: "low" | "medium" | "high";
  reason: string;
  score: number;
}

export function scoreHeadline(title: string, description = ""): HeadlineScore {
  const cfg = intelConfig.news;
  const hay = `${title} ${description}`.toLowerCase();
  const pos = count(hay, cfg.positive);
  const neg = count(hay, cfg.negative);
  const macro = count(hay, cfg.highImpact);
  const score = pos.length - neg.length;
  const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  const mag = Math.abs(score);
  const impact: HeadlineScore["impact"] = macro.length >= 1 ? (mag >= cfg.impactMediumScore || macro.length >= 2 ? "high" : "medium") : mag >= cfg.impactMediumScore ? "medium" : "low";
  const bits: string[] = [];
  if (pos.length) bits.push(`positive: ${pos.slice(0, 3).join(", ")}`);
  if (neg.length) bits.push(`negative: ${neg.slice(0, 3).join(", ")}`);
  if (macro.length) bits.push(`macro: ${macro.slice(0, 2).join(", ")}`);
  const reason = bits.length ? bits.join(" · ") : "no strong sentiment keywords";
  return { sentiment, impact, reason, score };
}

/** Recency decay: 1.0 now → ~0 at decayHours. */
function recencyWeight(ageMinutes: number | null): number {
  if (ageMinutes == null) return intelConfig.news.missingWeight;
  const w = 1 - ageMinutes / (intelConfig.news.decayHours * 60);
  return Math.max(0, Math.min(1, w));
}

export interface SentimentAggregate {
  label: "positive" | "negative" | "neutral";
  stockScore: number;
  marketScore: number;
  strongNegative: boolean;
  strongPositive: boolean;
  reasons: string[];
}

/** Aggregate scored items into stock- and market-level bias with decay. */
export function aggregateSentiment(items: { ageMinutes: number | null; matched?: string; score: HeadlineScore }[]): SentimentAggregate {
  const cfg = intelConfig.news;
  let market = 0;
  let stock = 0;
  let strongNeg = false;
  let strongPos = false;
  const reasons: string[] = [];
  for (const it of items) {
    const rw = recencyWeight(it.ageMinutes);
    const w = rw * cfg.impactWeights[it.score.impact];
    const contrib = it.score.score * w;
    market += contrib;
    if (it.matched) stock += contrib;
    if (it.score.sentiment === "negative" && it.score.impact !== "low" && rw > cfg.strongRecency) strongNeg = true;
    if (it.score.sentiment === "positive" && it.score.impact === "high" && rw > cfg.strongRecency) strongPos = true;
  }
  market = Math.round(market * 100) / 100;
  stock = Math.round(stock * 100) / 100;
  const basis = stock !== 0 ? stock : market;
  const label = basis > 0.5 ? "positive" : basis < -0.5 ? "negative" : "neutral";
  if (strongNeg) reasons.push("A recent high-impact negative headline is present — blocks fresh long unless price action confirms recovery.");
  if (strongPos) reasons.push("A recent high-impact positive headline supports the long side (needs price + volume confirmation).");
  return { label, stockScore: stock, marketScore: market, strongNegative: strongNeg, strongPositive: strongPos, reasons };
}
