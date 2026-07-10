// Combined market-intelligence engine (READ-ONLY, advisory). Fuses the technical
// live signal with India VIX, news sentiment and market breadth into one
// ENTER / WAIT / HOLD / EXIT / AVOID / NO ACTION recommendation. ALL weights,
// thresholds and rules come from intelConfig.decision (env-overridable) — no
// magic numbers here. Preserves the win + confidence gates for ENTER. Missing
// inputs (VIX/news) degrade gracefully — never fabricated.

import { getLiveSignal } from "./liveTradePlan.service";
import { getVix, type VixResult } from "./vix.service";
import { getMarketNews, type NewsItem, type NewsResult } from "./news.service";
import { aggregateSentiment, scoreHeadline, type SentimentAggregate } from "./sentiment.service";
import { getTopMovers } from "./topMovers";
import { intelConfig } from "../config/intelligence.config";

const D = intelConfig.decision;
const W = D.weights;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export interface FactorCard { key: string; label: string; status: string; value: string; tone: "bull" | "bear" | "neutral" | "warn"; reason: string }

export interface MarketIntelligence {
  instrument: string;
  displayName: string;
  timestamp: string;
  finalAction: "ENTER" | "WAIT" | "HOLD" | "EXIT" | "AVOID" | "NO ACTION";
  bias: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  winEstimate: number;
  risk: "Low" | "Medium" | "High";
  caution: string;
  reason: string;
  supporting: string[];
  blocking: string[];
  entryWindow: string;
  exitWindow: string;
  cards: FactorCard[];
  study: { technical: string; vix: string; news: string; trend: string; risk: string; recommendation: string };
  vix: VixResult;
  news: NewsResult;
  newsMatched: NewsItem[];
  sentiment: SentimentAggregate;
  trend: { breadthAdv: number; breadthDec: number; breadthScore: number; note: string };
  technical: { action: string; trend: string; strength: string; bullishPercent: number; invalidation: number; dataQuality: string };
  readOnly: true;
  disclaimer: string;
}

let breadthCache: { at: number; adv: number; dec: number } | null = null;
export async function getBreadth(): Promise<{ adv: number; dec: number; ok: boolean }> {
  if (breadthCache && Date.now() - breadthCache.at < intelConfig.movers.breadthCacheMs) return { ...breadthCache, ok: true };
  try {
    const r = await getTopMovers("indices");
    breadthCache = { at: Date.now(), adv: r.gainers.length, dec: r.losers.length };
    return { adv: r.gainers.length, dec: r.losers.length, ok: true };
  } catch {
    return { adv: 0, dec: 0, ok: false };
  }
}

export async function getMarketIntelligence(opts: { instrument?: string; underlying?: string; segment?: string; instrumentType?: string; expiry?: string; strike?: string; optionType?: string; interval?: string; riskProfile?: string }): Promise<MarketIntelligence> {
  const signal = await getLiveSignal({ ...opts });
  const [vix, marketNews, breadth] = await Promise.all([getVix(), getMarketNews(), getBreadth()]);
  return fuseIntelligence(signal, vix, marketNews, breadth);
}

/**
 * Pure fusion of a live signal + VIX + news + breadth into the intelligence
 * result. Extracted from getMarketIntelligence so the real-time decision loop
 * can reuse the exact same fused scores/action WITHOUT re-fetching Kite data.
 */
export function fuseIntelligence(
  signal: Awaited<ReturnType<typeof getLiveSignal>>,
  vix: VixResult,
  marketNews: NewsResult,
  breadth: { adv: number; dec: number; ok: boolean },
): MarketIntelligence {
  const displayName = signal.resolvedInstrument.displayName || signal.instrument;
  const now = new Date().toISOString();

  // ----- news sentiment (stock + market) -----
  const symClean = (signal.resolvedInstrument.tradingsymbol || displayName).toUpperCase();
  const kws = [symClean, ...displayName.toUpperCase().split(/\s+/)].filter((k) => k.length >= intelConfig.news.symbolMinKeywordLen);
  const items = marketNews.available ? marketNews.items : [];
  const forAgg = items.map((it) => ({ ageMinutes: it.ageMinutes, matched: kws.some((k) => it.title.toUpperCase().includes(k)) ? symClean : undefined, score: scoreHeadline(it.title) }));
  const sentiment = aggregateSentiment(forAgg);
  const newsMatched = items.filter((it) => kws.some((k) => it.title.toUpperCase().includes(k))).map((it) => ({ ...it, matched: symClean }));

  // ----- factor scores (bias in [-1,1]) -----
  const action = signal.finalDecision.action;
  const dir = action === "LONG" ? 1 : action === "SHORT" ? -1 : signal.trend.direction === "bullish" ? 0.5 : signal.trend.direction === "bearish" ? -0.5 : 0;
  const strengthMag = signal.trend.strength === "strong" ? D.strengthMag.strong : signal.trend.strength === "moderate" ? D.strengthMag.moderate : D.strengthMag.weak;
  const techScore = clamp(D.techDirBlend * dir * strengthMag + (1 - D.techDirBlend) * ((signal.probability.bullishPercent - 50) / 50), -1, 1);

  const volConfirmed = signal.indicators.volumeConfirmed;
  const volScore = volConfirmed === true ? D.volConfirmedScore * Math.sign(dir || 1) : volConfirmed === false ? D.volWeakScore * Math.sign(dir || 1) : 0;

  const newsBasis = sentiment.stockScore !== 0 ? sentiment.stockScore : sentiment.marketScore;
  const newsScore = clamp(newsBasis / D.newsBiasDivisor, -1, 1);

  const total = breadth.adv + breadth.dec;
  const breadthScore = total > 0 ? (breadth.adv - breadth.dec) / total : 0;

  const biasScore = W.technical * techScore + W.news * newsScore + W.breadth * breadthScore + W.volume * volScore;
  const bias: MarketIntelligence["bias"] = biasScore > D.biasThreshold ? "Bullish" : biasScore < -D.biasThreshold ? "Bearish" : "Neutral";

  // ----- confidence (technical win, adjusted) -----
  const win = signal.probability.estimatedWinPercent;
  const dirBull = action === "LONG";
  const dirSign = action === "LONG" ? 1 : action === "SHORT" ? -1 : 0;
  const agree = dirSign !== 0 ? Math.sign(newsScore) === dirSign || Math.sign(breadthScore) === dirSign : false;
  let confidence = win;
  if (agree) confidence += D.confidence.agreeBonus;
  if (vix.available) confidence += vix.score * D.confidence.vixWeight;
  if (sentiment.strongNegative && dirBull) confidence -= D.confidence.strongNegPenalty;
  if (dirSign !== 0 && Math.sign(newsScore) === -dirSign && Math.abs(newsScore) > D.confidence.opposeNewsThreshold) confidence -= D.confidence.opposeNewsPenalty;
  confidence = Math.round(clamp(confidence, D.confidence.min, D.confidence.max));

  // ----- risk level -----
  const highVol = vix.available && (vix.status === "high" || (vix.status === "elevated" && vix.direction === "rising"));
  const risk: MarketIntelligence["risk"] = highVol || sentiment.strongNegative ? "High" : vix.available && vix.status === "low" && agree ? "Low" : "Medium";

  // ----- factors -----
  const supporting: string[] = [];
  const blocking: string[] = [];
  if (Math.sign(techScore) === dirSign && dirSign !== 0) supporting.push(`Technicals lean ${dirBull ? "bullish" : "bearish"} (${signal.trend.strength} ${signal.trend.direction} trend, ${signal.probability.bullishPercent}% bull).`);
  if (volConfirmed) supporting.push("Volume confirms the move.");
  if (dirSign !== 0 && Math.sign(breadthScore) === dirSign && Math.abs(breadthScore) > D.breadth.supportThreshold) supporting.push(`Market breadth agrees (${breadth.adv} up / ${breadth.dec} down).`);
  if (dirSign !== 0 && Math.sign(newsScore) === dirSign && Math.abs(newsScore) > D.newsSupportThreshold) supporting.push(`News sentiment is ${sentiment.label}.`);
  if (vix.available && vix.score > 0) supporting.push(`${vix.interpretation}.`);

  if (win < D.winThreshold) blocking.push(`Win estimate ${win}% is below the ${D.winThreshold}% approval gate.`);
  if (sentiment.strongNegative && dirBull) blocking.push("Recent high-impact negative news — blocks a fresh long until price action confirms recovery.");
  if (highVol) blocking.push(`${vix.interpretation}.`);
  if (dirSign !== 0 && Math.sign(breadthScore) === -dirSign && Math.abs(breadthScore) > D.breadth.blockThreshold) blocking.push(`Market breadth opposes the setup (${breadth.adv} up / ${breadth.dec} down).`);
  if (dirSign !== 0 && Math.sign(newsScore) === -dirSign && Math.abs(newsScore) > D.newsOpposeThreshold) blocking.push(`News sentiment (${sentiment.label}) opposes the setup.`);

  // ----- final action (win + confidence gates preserved) -----
  let finalAction: MarketIntelligence["finalAction"];
  let caution: string;
  const conflict = bias !== "Neutral" && dirSign !== 0 && ((bias === "Bullish" && dirSign < 0) || (bias === "Bearish" && dirSign > 0));

  if (action === "AVOID") {
    finalAction = "AVOID";
    caution = "avoid fresh entry";
  } else if (action === "WAIT" || dirSign === 0) {
    finalAction = conflict ? "NO ACTION" : "WAIT";
    caution = "wait for confirmation";
  } else {
    const gate = win >= D.winThreshold && confidence >= D.minEnterConfidence;
    const hardBlock = (sentiment.strongNegative && dirBull) || (vix.available && vix.status === "high" && vix.direction === "rising") || conflict;
    const cautionZone = highVol || (dirBull ? breadthScore < -D.breadth.cautionThreshold : breadthScore > D.breadth.cautionThreshold) || Math.sign(newsScore) === -dirSign;
    if (hardBlock) {
      finalAction = sentiment.strongNegative && dirBull ? "AVOID" : "NO ACTION";
      caution = "avoid fresh entry";
    } else if (!gate) {
      finalAction = "WAIT";
      caution = "wait for confirmation";
    } else if (cautionZone) {
      finalAction = "WAIT";
      caution = "reduced size — wait for confirmation";
    } else {
      finalAction = "ENTER";
      caution = highVol ? "reduced size" : "normal size";
    }
  }

  const inval = signal.finalDecision.invalidationLevel;
  const vwap = signal.marketData.vwap;
  const entryWindow =
    finalAction === "ENTER" ? "Now — trigger and gate are met; enter on the locked plan."
      : finalAction === "WAIT" ? "Next 1–3 candles if the trigger holds and blocking factors clear."
        : finalAction === "AVOID" || finalAction === "NO ACTION" ? "No valid entry window — setup blocked."
          : "—";
  const exitWindow = dirBull
    ? `Exit-risk: price loses VWAP ${vwap ?? "—"} for ~2 candles, breaks invalidation ${inval}, or a negative news shock hits.`
    : `Exit-risk: price reclaims VWAP ${vwap ?? "—"} for ~2 candles, breaks invalidation ${inval}, or a positive news shock hits.`;

  const reason =
    finalAction === "ENTER" ? `Technicals (${win}% win), ${bias.toLowerCase()} bias and risk conditions align. ${caution}.`
      : finalAction === "AVOID" ? `Setup too risky: ${blocking[0] ?? "risk factors present"}.`
        : finalAction === "NO ACTION" ? "Signals conflict across technicals, breadth and news — stand aside."
          : finalAction === "WAIT" ? `Promising but unconfirmed: ${blocking[0] ?? "awaiting trigger/confirmation"}.`
            : "Manage existing position against the locked levels.";

  const tone = (s: number): FactorCard["tone"] => (s > D.biasThreshold ? "bull" : s < -D.biasThreshold ? "bear" : "neutral");
  const cards: FactorCard[] = [
    { key: "technical", label: "Technical bias", status: `${signal.trend.direction} ${signal.trend.strength}`, value: `${signal.probability.bullishPercent}% bull`, tone: tone(techScore), reason: signal.trend.reason },
    { key: "vix", label: "VIX / volatility", status: vix.available ? vix.status : "unavailable", value: vix.available ? `${vix.value}${vix.change != null ? ` (${vix.change >= 0 ? "+" : ""}${vix.change})` : ""}` : "—", tone: !vix.available ? "neutral" : vix.score >= 0 ? "bull" : "warn", reason: vix.interpretation },
    { key: "news", label: "News sentiment", status: marketNews.available ? sentiment.label : "unavailable", value: marketNews.available ? `${newsMatched.length} stock · ${items.length} mkt` : "—", tone: !marketNews.available ? "neutral" : tone(newsScore), reason: marketNews.available ? (sentiment.reasons[0] ?? `Market news ${sentiment.label}.`) : (marketNews.message ?? "News unavailable.") },
    { key: "trend", label: "Market trend / breadth", status: breadth.ok ? (breadthScore > D.breadth.supportThreshold ? "advancing" : breadthScore < -D.breadth.supportThreshold ? "declining" : "mixed") : "unavailable", value: breadth.ok ? `${breadth.adv} up / ${breadth.dec} down` : "—", tone: tone(breadthScore), reason: breadth.ok ? "Index breadth from the bounded live scan." : "Breadth needs live Kite." },
    { key: "volume", label: "Volume / OI", status: volConfirmed == null ? "n/a" : volConfirmed ? "confirmed" : "weak", value: signal.indicators.oi != null ? `OI ${signal.indicators.oi}` : volConfirmed == null ? "—" : volConfirmed ? "confirms" : "no confirm", tone: volConfirmed ? tone(dir) : "neutral", reason: volConfirmed == null ? "Volume confirmation unavailable." : volConfirmed ? "Volume supports the move." : "Volume does not confirm." },
    { key: "final", label: "Final action", status: finalAction, value: `${confidence}% · ${risk} risk`, tone: finalAction === "ENTER" ? (dirBull ? "bull" : "bear") : finalAction === "AVOID" ? "bear" : "warn", reason },
  ];

  const study = {
    technical: `${signal.trend.direction} trend (${signal.trend.strength}), ${signal.probability.bullishPercent}% bullish / ${signal.probability.bearishPercent}% bearish, win estimate ${win}% (${signal.probability.dataQuality}). Preferred setup: ${signal.preferredSetup}. ${signal.finalDecision.reason}`,
    vix: vix.available ? `India VIX ${vix.value} (${vix.change != null && vix.change >= 0 ? "+" : ""}${vix.change ?? "—"}, ${vix.direction}). ${vix.interpretation}. ${vix.score < 0 ? "Reduces approval confidence / suggests smaller size." : "Supports trend-following if technicals confirm."}` : "VIX unavailable — the decision uses technicals + news + breadth only.",
    news: marketNews.available ? `${items.length} market headlines, ${newsMatched.length} mention ${symClean}. Market bias ${sentiment.label} (score ${sentiment.marketScore}). ${sentiment.reasons.join(" ") || "No high-impact news blocking the setup."}` : `${marketNews.message ?? "News unavailable"} — decision is technical + VIX only.`,
    trend: breadth.ok ? `Breadth (indices scan): ${breadth.adv} advancing / ${breadth.dec} declining → ${breadthScore > D.breadth.supportThreshold ? "supports longs" : breadthScore < -D.breadth.supportThreshold ? "supports shorts / caution longs" : "mixed, no edge"}.` : "Market breadth unavailable (needs live Kite).",
    risk: `Risk ${risk}. ${highVol ? "Elevated/high volatility — size down or wait." : "Volatility manageable."} ${sentiment.strongNegative ? "A high-impact negative headline is active." : ""} Caution: ${caution}.`,
    recommendation: `${finalAction} — ${reason} ${supporting.length ? `Supporting: ${supporting.length}.` : ""} ${blocking.length ? `Blocking: ${blocking.length}.` : ""}`,
  };

  return {
    instrument: signal.instrument,
    displayName,
    timestamp: now,
    finalAction,
    bias,
    confidence,
    winEstimate: win,
    risk,
    caution,
    reason,
    supporting,
    blocking,
    entryWindow,
    exitWindow,
    cards,
    study,
    vix,
    news: marketNews,
    newsMatched,
    sentiment,
    trend: { breadthAdv: breadth.adv, breadthDec: breadth.dec, breadthScore: Math.round(breadthScore * 100) / 100, note: breadth.ok ? "" : "breadth unavailable" },
    technical: { action, trend: signal.trend.direction, strength: signal.trend.strength, bullishPercent: signal.probability.bullishPercent, invalidation: inval, dataQuality: signal.probability.dataQuality },
    readOnly: true,
    disclaimer: signal.disclaimer,
  };
}
