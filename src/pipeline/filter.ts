import type { NewsItem } from '../domain/types.js';

export interface FilterOptions {
  /** Lower bound for `publishedAt` (items without a date are kept). */
  from: Date;
  /** Preferred language (ISO 639-1). */
  language: string;
  /** Minimum score required to keep an item. */
  minScore: number;
}

/**
 * Keep only relevant items:
 * - score at or above the threshold (items with no keyword match score low);
 * - published within the time window (unknown dates are kept, not guessed);
 * - language compatible with the target, when the item exposes a 2-letter code
 *   (full-name or missing languages are kept to avoid over-filtering).
 */
export function filterItems(items: NewsItem[], options: FilterOptions): NewsItem[] {
  const fromTime = options.from.getTime();
  const target = options.language.slice(0, 2).toLowerCase();

  return items.filter((item) => {
    if (item.score < options.minScore) return false;
    if (!withinWindow(item.publishedAt, fromTime)) return false;
    if (!languageMatches(item.language, target)) return false;
    return true;
  });
}

function withinWindow(publishedAt: string | null, fromTime: number): boolean {
  if (!publishedAt) return true;
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return true;
  return time >= fromTime;
}

function languageMatches(language: string | null, target: string): boolean {
  if (!language) return true;
  // Only filter on unambiguous 2-letter ISO codes; keep full names like "English".
  if (language.length > 3) return true;
  return language.slice(0, 2).toLowerCase() === target;
}
