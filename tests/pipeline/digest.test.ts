import { describe, expect, it } from 'vitest';
import { buildDigest } from '../../src/pipeline/digest.js';
import type { NewsItem } from '../../src/domain/types.js';

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'Title',
    url: 'https://example.com/a',
    source: 'Example',
    publishedAt: '2026-06-23T00:00:00.000Z',
    description: 'desc',
    imageUrl: null,
    language: null,
    provider: 'p',
    score: 1,
    categories: [],
    dedupKey: 'k',
    fetchedAt: '2026-06-23T01:00:00.000Z',
    ...overrides,
  };
}

describe('buildDigest', () => {
  it('returns null when there are no items', () => {
    expect(buildDigest([])).toBeNull();
  });

  it('orders embeds by score and builds a summary line', () => {
    const digest = buildDigest([
      item({ dedupKey: 'low', title: 'low', score: 1 }),
      item({ dedupKey: 'high', title: 'high', score: 9 }),
    ]);
    expect(digest?.embeds.map((e) => e.title)).toEqual(['high', 'low']);
    expect(digest?.content).toContain('2 stories');
  });

  it('caps embeds at the requested maximum (and Discord hard limit)', () => {
    const items = Array.from({ length: 15 }, (_, i) => item({ dedupKey: `k${i}`, score: i }));
    expect(buildDigest(items)?.embeds).toHaveLength(10);
    expect(buildDigest(items, { maxEmbeds: 3 })?.embeds).toHaveLength(3);
  });

  it('maps optional fields and truncates long titles', () => {
    const digest = buildDigest([item({ title: 'x'.repeat(300), imageUrl: 'https://img/1.png' })]);
    const embed = digest!.embeds[0]!;
    expect(embed.title.length).toBe(256);
    expect(embed.title.endsWith('…')).toBe(true);
    expect(embed.footer?.text).toBe('Example');
    expect(embed.image?.url).toBe('https://img/1.png');
    expect(embed.timestamp).toBe('2026-06-23T00:00:00.000Z');
  });
});
