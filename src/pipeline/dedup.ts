import type { NewsItem } from '../domain/types.js';

/**
 * Collapse items sharing a `dedupKey`, keeping the strongest representative
 * (highest score, then the most recent `publishedAt`). Insertion order of the
 * surviving items is preserved.
 */
export function dedupItems(items: NewsItem[]): NewsItem[] {
  const best = new Map<string, NewsItem>();
  const order: string[] = [];

  for (const item of items) {
    const existing = best.get(item.dedupKey);
    if (!existing) {
      best.set(item.dedupKey, item);
      order.push(item.dedupKey);
    } else if (isBetter(item, existing)) {
      best.set(item.dedupKey, item);
    }
  }

  return order.map((key) => best.get(key)!);
}

function isBetter(candidate: NewsItem, current: NewsItem): boolean {
  if (candidate.score !== current.score) return candidate.score > current.score;
  return publishedTime(candidate) > publishedTime(current);
}

function publishedTime(item: NewsItem): number {
  if (!item.publishedAt) return 0;
  const time = Date.parse(item.publishedAt);
  return Number.isNaN(time) ? 0 : time;
}
