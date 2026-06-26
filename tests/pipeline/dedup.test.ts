import { describe, expect, it } from 'vitest';
import { dedupItems } from '../../src/pipeline/dedup.js';
import type { NewsItem } from '../../src/domain/types.js';

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 't',
    url: 'https://example.com/a',
    source: null,
    publishedAt: null,
    description: null,
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

describe('dedupItems', () => {
  it('keeps the highest-scoring representative per dedupKey', () => {
    const result = dedupItems([
      item({ dedupKey: 'a', score: 1, title: 'low' }),
      item({ dedupKey: 'a', score: 5, title: 'high' }),
      item({ dedupKey: 'b', score: 2, title: 'b' }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.dedupKey === 'a')?.title).toBe('high');
  });

  it('breaks score ties by most recent publishedAt', () => {
    const result = dedupItems([
      item({ dedupKey: 'a', score: 3, publishedAt: '2026-06-20T00:00:00.000Z', title: 'older' }),
      item({ dedupKey: 'a', score: 3, publishedAt: '2026-06-23T00:00:00.000Z', title: 'newer' }),
    ]);
    expect(result[0]?.title).toBe('newer');
  });

  it('preserves first-seen order of surviving items', () => {
    const result = dedupItems([
      item({ dedupKey: 'x' }),
      item({ dedupKey: 'y' }),
      item({ dedupKey: 'x' }),
    ]);
    expect(result.map((i) => i.dedupKey)).toEqual(['x', 'y']);
  });
});
