import { desc, gte, inArray } from 'drizzle-orm';
import type { NewsItem } from '../domain/types.js';
import type { Db } from './client.js';
import { newsItems, type NewsItemRow } from './schema.js';

/** Map a persisted row back to the domain `NewsItem`. */
function rowToNewsItem(row: NewsItemRow): NewsItem {
  return {
    title: row.title,
    url: row.url,
    source: row.source,
    publishedAt: row.publishedAt,
    description: row.description,
    imageUrl: row.imageUrl,
    language: row.language,
    provider: row.provider,
    score: row.score,
    categories: parseCategories(row.categories),
    dedupKey: row.dedupKey,
    fetchedAt: row.fetchedAt,
  };
}

function parseCategories(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Persistence boundary for curated news items. Keeps the rest of the codebase
 * free of Drizzle/SQL specifics and guarantees idempotency by `dedupKey`.
 */
export class NewsRepository {
  constructor(private readonly db: Db) {}

  /**
   * Insert items, skipping any whose `dedupKey` already exists. Returns the
   * number of rows actually inserted, so a re-run reports zero new items.
   */
  insertMany(items: NewsItem[]): number {
    if (items.length === 0) return 0;

    const rows = items.map((item) => ({
      dedupKey: item.dedupKey,
      title: item.title,
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt,
      description: item.description,
      imageUrl: item.imageUrl,
      language: item.language,
      provider: item.provider,
      score: item.score,
      categories: JSON.stringify(item.categories),
      fetchedAt: item.fetchedAt,
    }));

    const inserted = this.db
      .insert(newsItems)
      .values(rows)
      .onConflictDoNothing({ target: newsItems.dedupKey })
      .returning({ dedupKey: newsItems.dedupKey })
      .all();

    return inserted.length;
  }

  /** Return the subset of `dedupKeys` that already exist in the database. */
  existingDedupKeys(dedupKeys: string[]): Set<string> {
    if (dedupKeys.length === 0) return new Set();
    const rows = this.db
      .select({ dedupKey: newsItems.dedupKey })
      .from(newsItems)
      .where(inArray(newsItems.dedupKey, dedupKeys))
      .all();
    return new Set(rows.map((row) => row.dedupKey));
  }

  /** Most recent items fetched at or after the given ISO-8601 instant. */
  findRecent(sinceIso: string, limit = 50): NewsItem[] {
    return this.db
      .select()
      .from(newsItems)
      .where(gte(newsItems.fetchedAt, sinceIso))
      .orderBy(desc(newsItems.fetchedAt))
      .limit(limit)
      .all()
      .map(rowToNewsItem);
  }

  /** Mark the given items as delivered at the provided ISO-8601 instant. */
  markDelivered(dedupKeys: string[], deliveredAtIso: string): void {
    if (dedupKeys.length === 0) return;
    this.db
      .update(newsItems)
      .set({ deliveredAt: deliveredAtIso })
      .where(inArray(newsItems.dedupKey, dedupKeys))
      .run();
  }
}
