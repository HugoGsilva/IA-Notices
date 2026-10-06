import type { NewsItem } from '../domain/types.js';
import { HIGH_SIGNAL_KEYWORDS, qualityScore } from './relevance.js';

const TITLE_WEIGHT = 1;
const DESCRIPTION_WEIGHT = 0.5;
const HIGH_SIGNAL_TITLE_WEIGHT = 3;
const HIGH_SIGNAL_DESCRIPTION_WEIGHT = 1.5;
const RECENT_6H_BONUS = 2;
const RECENT_24H_BONUS = 1;

const HOUR_MS = 60 * 60 * 1000;

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does `haystack` contain `keyword` as a whole word (case-insensitive)?
 *
 * Whole-word matching (Unicode-aware boundaries) avoids substring false
 * positives — e.g. the keyword "AI" must not match "Spain" or "available".
 */
function matchesKeyword(haystack: string, keyword: string): boolean {
  const term = keyword.trim();
  if (!term) return false;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`,
    'iu',
  );
  return pattern.test(haystack);
}

/**
 * Explainable relevance score for an item.
 *
 * The old scorer treated every keyword almost equally, which made generic
 * "AI" mentions and SEO/clickbait capable of reaching the delivery threshold.
 * This version keeps keyword matching deterministic but adds quality signals:
 * specific AI terms are worth more, concrete news events and facts add weight,
 * reputable/primary sources get a modest bonus, and obvious slop is penalised.
 */
export function scoreItem(item: NewsItem, keywords: string[], now: Date): NewsItem {
  const title = item.title ?? '';
  const description = item.description ?? '';

  let score = 0;
  const categories: string[] = [];

  for (const keyword of keywords) {
    let matched = false;
    const normalizedKeyword = keyword.trim().toLowerCase();
    const isHighSignal = HIGH_SIGNAL_KEYWORDS.has(normalizedKeyword);

    if (matchesKeyword(title, keyword)) {
      score += isHighSignal ? HIGH_SIGNAL_TITLE_WEIGHT : TITLE_WEIGHT;
      matched = true;
    }
    if (matchesKeyword(description, keyword)) {
      score += isHighSignal ? HIGH_SIGNAL_DESCRIPTION_WEIGHT : DESCRIPTION_WEIGHT;
      matched = true;
    }
    if (matched) categories.push(normalizedKeyword);
  }

  score += qualityScore(item, categories);

  // Recency boosts relevant items; it never makes a non-matching item relevant.
  if (categories.length > 0) {
    score += recencyBonus(item.publishedAt, now);
  }

  return { ...item, score, categories };
}

function recencyBonus(publishedAt: string | null, now: Date): number {
  if (!publishedAt) return 0;
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return 0;
  const ageHours = (now.getTime() - time) / HOUR_MS;
  if (ageHours < 0) return 0;
  if (ageHours <= 6) return RECENT_6H_BONUS;
  if (ageHours <= 24) return RECENT_24H_BONUS;
  return 0;
}

/** Score every item against the keyword set. */
export function scoreAll(items: NewsItem[], keywords: string[], now: Date): NewsItem[] {
  return items.map((item) => scoreItem(item, keywords, now));
}
