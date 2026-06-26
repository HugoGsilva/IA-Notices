import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Persisted, curated news items. The `dedupKey` is unique so re-runs are
 * idempotent and the same story is never stored twice.
 *
 * `categories` is stored as a JSON string (SQLite has no array type); the
 * repository serialises/deserialises it at the boundary.
 */
export const newsItems = sqliteTable(
  'news_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dedupKey: text('dedup_key').notNull().unique(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    source: text('source'),
    publishedAt: text('published_at'),
    description: text('description'),
    imageUrl: text('image_url'),
    language: text('language'),
    provider: text('provider').notNull(),
    score: real('score').notNull().default(0),
    /** JSON-encoded string[] of categories. */
    categories: text('categories').notNull().default('[]'),
    fetchedAt: text('fetched_at').notNull(),
    /** ISO-8601 timestamp set when the item was delivered; null until then. */
    deliveredAt: text('delivered_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => ({
    publishedAtIdx: index('news_items_published_at_idx').on(table.publishedAt),
    deliveredAtIdx: index('news_items_delivered_at_idx').on(table.deliveredAt),
  }),
);

export type NewsItemRow = typeof newsItems.$inferSelect;
export type NewNewsItemRow = typeof newsItems.$inferInsert;
