// News ingestion (server-side). Feeds, provider mode, caps, cache TTL, fetch
// timeout, dedupe and symbol-matching all come from intelConfig.news (env-
// overridable). Never fabricated: unreachable/empty/disabled → available:false.

import { intelConfig, isNewsEnabled } from "../config/intelligence.config";
import { scoreHeadline } from "./sentiment.service";

export interface NewsItem {
  title: string;
  source: string;
  url: string | null;
  publishedAt: string | null;
  ageMinutes: number | null;
  sentiment: "positive" | "negative" | "neutral";
  impact: "low" | "medium" | "high";
  reason: string;
  matched?: string;
}
export interface NewsResult { available: boolean; items: NewsItem[]; sources: string[]; fetchedAt: string; message?: string }

interface RawItem { title: string; url: string | null; pub: string | null; desc: string }

const cache = new Map<string, { at: number; result: NewsResult }>();

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "news"; }
}
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
}
function ageMin(pub: string | null): number | null {
  if (!pub) return null;
  const t = Date.parse(pub);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

async function fetchRss(url: string): Promise<RawItem[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(intelConfig.news.fetchTimeoutMs), headers: { "user-agent": "Mozilla/5.0 (compatible; trade-analysis-bot)" } });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const xml = await res.text();
  const items: RawItem[] = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && items.length < intelConfig.news.perFeedCap) {
    const b = m[0];
    const title = tag(b, "title");
    if (!title) continue;
    const linkM = b.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    items.push({ title, url: linkM ? decode(linkM[1]) : null, pub: tag(b, "pubDate"), desc: tag(b, "description") ?? "" });
  }
  return items;
}

async function fetchAll(): Promise<NewsResult> {
  const now = new Date().toISOString();
  if (!isNewsEnabled()) return { available: false, items: [], sources: [], fetchedAt: now, message: `News provider "${intelConfig.news.provider}" not configured (set NEWS_RSS_URLS or NEWS_API_KEY).` };
  const urls = intelConfig.news.rssUrls;

  const settled = await Promise.allSettled(urls.map(fetchRss));
  const items: NewsItem[] = [];
  const sources = new Set<string>();
  const seen = new Set<string>();
  const staleMinutes = intelConfig.news.staleCutoffHours * 60;
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const src = hostOf(urls[i]);
    for (const it of r.value) {
      const age = ageMin(it.pub);
      if (age != null && age > staleMinutes) continue; // never present stale news as recent
      const dedupe = it.title.toLowerCase().slice(0, intelConfig.news.dedupePrefix);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const sc = scoreHeadline(it.title, it.desc);
      items.push({ title: it.title, source: src, url: it.url, publishedAt: it.pub, ageMinutes: age, sentiment: sc.sentiment, impact: sc.impact, reason: sc.reason });
      sources.add(src);
    }
  });

  if (items.length === 0) return { available: false, items: [], sources: [], fetchedAt: now, message: "News feeds unreachable or empty — analysis continues from technicals/VIX only." };
  items.sort((a, b) => (a.ageMinutes ?? 1e9) - (b.ageMinutes ?? 1e9));
  return { available: true, items: items.slice(0, intelConfig.news.maxItems), sources: [...sources], fetchedAt: now };
}

export async function getMarketNews(): Promise<NewsResult> {
  const c = cache.get("market");
  if (c && Date.now() - c.at < intelConfig.news.cacheMs) return c.result;
  const result = await fetchAll();
  cache.set("market", { at: Date.now(), result });
  return result;
}

/** Market news filtered to items mentioning the instrument's symbol. */
export async function getInstrumentNews(symbol: string): Promise<NewsResult> {
  const base = await getMarketNews();
  if (!base.available) return base;
  const s = symbol.replace(/^[A-Z]+:/, "").trim();
  const minLen = intelConfig.news.symbolMinKeywordLen;
  const kw = [s, ...s.split(/\s+/)].map((x) => x.toLowerCase()).filter((x) => x.length >= minLen);
  const matched = base.items.filter((it) => kw.some((k) => it.title.toLowerCase().includes(k))).map((it) => ({ ...it, matched: s }));
  return { ...base, items: matched, message: matched.length === 0 ? `No recent headlines mentioning ${s} in the market feeds.` : undefined };
}
