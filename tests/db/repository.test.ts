import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../src/db/client.js';
import { NewsRepository } from '../../src/db/repository.js';
import { newsItems } from '../../src/db/schema.js';
import type { NewsItem } from '../../src/domain/types.js';

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'OpenAI ships a new model',
    url: 'https://example.com/news/1',
    source: 'Example News',
    publishedAt: '2026-06-23T00:00:00.000Z',
    description: 'A description',
    imageUrl: null,
    language: 'en',
    provider: 'newsapi',
    score: 3,
    categories: ['llm'],
    dedupKey: 'key-1',
    fetchedAt: '2026-06-23T01:00:00.000Z',
    ...overrides,
  };
}

describe('NewsRepository', () => {
  let db: Db;
  let repo: NewsRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new NewsRepository(db);
  });

  it('inserts items and reports the inserted count', () => {
    const inserted = repo.insertMany([makeItem({ dedupKey: 'a' }), makeItem({ dedupKey: 'b' })]);
    expect(inserted).toBe(2);
  });

  it('is idempotent across runs by dedupKey', () => {
    repo.insertMany([makeItem({ dedupKey: 'a' })]);
    const second = repo.insertMany([makeItem({ dedupKey: 'a' }), makeItem({ dedupKey: 'c' })]);
    // Only the new key 'c' is inserted; 'a' is skipped.
    expect(second).toBe(1);
  });

  it('round-trips categories as a string array', () => {
    repo.insertMany([makeItem({ dedupKey: 'a', categories: ['llm', 'robotics'] })]);
    const [item] = repo.findRecent('2026-06-23T00:00:00.000Z');
    expect(item?.categories).toEqual(['llm', 'robotics']);
  });

  it('returns existing dedup keys only', () => {
    repo.insertMany([makeItem({ dedupKey: 'a' }), makeItem({ dedupKey: 'b' })]);
    const existing = repo.existingDedupKeys(['a', 'x', 'b', 'y']);
    expect(existing).toEqual(new Set(['a', 'b']));
  });

  it('findRecent filters by fetchedAt and orders newest first', () => {
    repo.insertMany([
      makeItem({ dedupKey: 'old', fetchedAt: '2026-06-20T00:00:00.000Z' }),
      makeItem({ dedupKey: 'new', fetchedAt: '2026-06-23T05:00:00.000Z' }),
    ]);
    const recent = repo.findRecent('2026-06-22T00:00:00.000Z');
    expect(recent.map((i) => i.dedupKey)).toEqual(['new']);
  });

  it('marks items as delivered', () => {
    repo.insertMany([makeItem({ dedupKey: 'a' })]);
    repo.markDelivered(['a'], '2026-06-23T02:00:00.000Z');
    const [row] = db.select().from(newsItems).where(eq(newsItems.dedupKey, 'a')).all();
    expect(row?.deliveredAt).toBe('2026-06-23T02:00:00.000Z');
  });

  it('handles empty inputs without touching the database', () => {
    expect(repo.insertMany([])).toBe(0);
    expect(repo.existingDedupKeys([])).toEqual(new Set());
    expect(() => repo.markDelivered([], 'now')).not.toThrow();
  });
});
