import type { NewsItem } from '../domain/types.js';

const TITLE_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;
const RECENT_6H_BONUS = 2;
const RECENT_24H_BONUS = 1;

const HOUR_MS = 60 * 60 * 1000;

/** Does `haystack` contain `keyword` as a case-insensitive substring? */
function contains(haystack: string, keyword: string): boolean {
  return haystack.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * Heuristic relevance score for a single item:
 * - each distinct keyword found in the title adds `TITLE_WEIGHT`;
 * - each distinct keyword found in the description adds `DESCRIPTION_WEIGHT`;
 * - a recency bonus rewards fresh stories.
 *
 * Matched keywords become the item's categories. Pure and deterministic.
 */
export function scoreItem(item: NewsItem, keywords: string[], now: Date): NewsItem {
  const title = item.title ?? '';
  const description = item.description ?? '';

  let score = 0;
  const categories: string[] = [];

  for (const keyword of keywords) {
    let matched = false;
    if (contains(title, keyword)) {
      score += TITLE_WEIGHT;
      matched = true;
    }
    if (contains(description, keyword)) {
      score += DESCRIPTION_WEIGHT;
      matched = true;
    }
    if (matched) categories.push(keyword.toLowerCase());
  }

  score += recencyBonus(item.publishedAt, now);

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
