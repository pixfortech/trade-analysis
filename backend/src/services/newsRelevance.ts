// =====================================================================
// News → instrument relevance scoring (READ-ONLY). Classifies a headline
// against a canonical instrument identity using WHOLE-WORD/phrase matching
// (never crude single-substring), returning a relevance type + score + a
// human reason. Only DIRECT_INSTRUMENT / UNDERLYING / SECTOR clear the decision
// threshold; BENCHMARK / MACRO / MARKET_WIDE are context-only; IRRELEVANT is
// dropped. Scores/thresholds come from intelConfig.news.relevance.
// =====================================================================

import { intelConfig } from "../config/intelligence.config";
import type { InstrumentIdentity } from "./instrumentIdentity";

export type RelevanceType = "DIRECT_INSTRUMENT" | "UNDERLYING" | "SECTOR" | "BENCHMARK" | "MARKET_WIDE" | "MACRO" | "IRRELEVANT";
export interface RelevanceResult { type: RelevanceType; score: number; reason: string }

const MARKET_WIDE_TERMS = ["market", "markets", "sensex", "nifty", "index", "indices", "stocks", "equities", "d-street", "dalal street", "fii", "dii", "rupee", "share market", "stock market"];

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word / whole-phrase containment (word boundaries; case-insensitive). */
export function hasPhrase(hay: string, phrase: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  return new RegExp(`(?:^|[^a-z0-9])${esc(p)}(?:$|[^a-z0-9])`, "i").test(hay);
}

function firstHit(hay: string, phrases: string[]): string | null {
  for (const p of phrases) if (hasPhrase(hay, p)) return p;
  return null;
}

function benchmarkAliases(b: string): string[] {
  if (b === "BANKNIFTY") return ["bank nifty", "banknifty", "nifty bank"];
  if (b === "SENSEX") return ["sensex", "bse"];
  return ["nifty", "nifty 50", "nifty50"];
}

export function scoreRelevance(title: string, identity: InstrumentIdentity): RelevanceResult {
  const hay = ` ${title.toLowerCase()} `;
  const S = intelConfig.news.relevance.scores;

  // 1) Direct / underlying — the instrument (or its underlying) is named.
  const direct = firstHit(hay, identity.aliases);
  if (direct) {
    const isDirect = identity.identityType === "stock" && identity.assetClass === "equity";
    return { type: isDirect ? "DIRECT_INSTRUMENT" : "UNDERLYING", score: isDirect ? S.direct : S.underlying, reason: `names ${identity.underlyingDisplay} ("${direct}")` };
  }
  // 2) Sector / related entities (incl. RBI/rates for banking, oil/refining for RELIANCE).
  const sector = firstHit(hay, identity.relatedEntities);
  if (sector) return { type: "SECTOR", score: S.sector, reason: `${identity.sector ?? "related"} context ("${sector}")` };
  // 3) Benchmark index reference.
  const bench = firstHit(hay, benchmarkAliases(identity.benchmark));
  if (bench) return { type: "BENCHMARK", score: S.benchmark, reason: `${identity.benchmark} benchmark ("${bench}")` };
  // 4) Macro driver (RBI/Fed/inflation/crude/budget …) — context only.
  const macro = firstHit(hay, intelConfig.news.highImpact);
  if (macro) return { type: "MACRO", score: S.macro, reason: `macro event ("${macro}")` };
  // 5) Generic market-wide.
  const mw = firstHit(hay, MARKET_WIDE_TERMS);
  if (mw) return { type: "MARKET_WIDE", score: S.marketWide, reason: `general market ("${mw}")` };
  return { type: "IRRELEVANT", score: 0, reason: "no proven relevance to this instrument" };
}

/** Ranking priority (higher first). */
export function relevancePriority(t: RelevanceType): number {
  return ({ DIRECT_INSTRUMENT: 6, UNDERLYING: 5, SECTOR: 4, BENCHMARK: 3, MARKET_WIDE: 2, MACRO: 2, IRRELEVANT: 0 } as Record<RelevanceType, number>)[t];
}

/** Does this relevance clear the decision-impact gate? */
export function affectsDecision(score: number): boolean {
  return score >= intelConfig.news.relevance.minDecisionScore;
}
