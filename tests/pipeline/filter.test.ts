import { describe, expect, it } from 'vitest';
import { filterItems } from '../../src/pipeline/filter.js';
import type { NewsItem } from '../../src/domain/types.js';

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 't',
    url: 'https://example.com/a',
    source: null,
    publishedAt: '2026-06-23T00:00:00.000Z',
    description: null,
    imageUrl: null,
    language: null,
    provider: 'p',
    score: 5,
    categories: [],
    dedupKey: 'k',
    fetchedAt: '2026-06-23T01:00:00.000Z',
    ...overrides,
  };
}

const options = {
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  minScore: 2,
};

describe('filterItems', () => {
  it('drops items below the minimum score', () => {
    const result = filterItems([item({ score: 1 }), item({ score: 2 })], options);
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBe(2);
  });

  it('drops items published before the window but keeps unknown dates', () => {
    const result = filterItems(
      [
        item({ dedupKey: 'old', publishedAt: '2026-06-01T00:00:00.000Z' }),
        item({ dedupKey: 'in', publishedAt: '2026-06-23T00:00:00.000Z' }),
        item({ dedupKey: 'unknown', publishedAt: null }),
      ],
      options,
    );
    expect(result.map((i) => i.dedupKey)).toEqual(['in', 'unknown']);
  });

  it('drops mismatched 2-letter language codes but keeps full names', () => {
    const result = filterItems(
      [
        item({ dedupKey: 'pt', language: 'pt' }),
        item({ dedupKey: 'en', language: 'en' }),
        item({ dedupKey: 'full', language: 'English' }),
      ],
      options,
    );
    expect(result.map((i) => i.dedupKey)).toEqual(['en', 'full']);
  });
});
