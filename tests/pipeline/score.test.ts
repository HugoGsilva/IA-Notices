import { describe, expect, it } from 'vitest';
import { scoreAll, scoreItem } from '../../src/pipeline/score.js';
import type { NewsItem } from '../../src/domain/types.js';

const NOW = new Date('2026-06-23T12:00:00.000Z');

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'A story about Artificial Intelligence',
    url: 'https://example.com/a',
    source: null,
    publishedAt: null,
    description: 'mentions machine learning too',
    imageUrl: null,
    language: null,
    provider: 'p',
    score: 0,
    categories: [],
    dedupKey: 'k',
    fetchedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('scoreItem', () => {
  it('weights title matches above description matches and records categories', () => {
    const scored = scoreItem(item(), ['artificial intelligence', 'machine learning'], NOW);
    // title match (2) + description match (1) = 3
    expect(scored.score).toBe(3);
    expect(scored.categories).toEqual(['artificial intelligence', 'machine learning']);
  });

  it('scores zero when no keyword matches', () => {
    const scored = scoreItem(item({ title: 'cooking recipes', description: 'pasta' }), ['ai'], NOW);
    expect(scored.score).toBe(0);
    expect(scored.categories).toEqual([]);
  });

  it('matches whole words only — no substring false positives', () => {
    const scored = scoreItem(
      item({ title: 'Rain in Spain stays available', description: 'maintain the campaign' }),
      ['ai'],
      NOW,
    );
    expect(scored.score).toBe(0);
    expect(scored.categories).toEqual([]);
  });

  it('matches a standalone short keyword', () => {
    const scored = scoreItem(
      item({ title: 'New AI model shipped', description: 'none' }),
      ['ai'],
      NOW,
    );
    expect(scored.score).toBe(2);
    expect(scored.categories).toEqual(['ai']);
  });

  it('adds a recency bonus for fresh items', () => {
    const fresh = scoreItem(
      item({ publishedAt: '2026-06-23T09:00:00.000Z' }), // 3h old → +2
      ['artificial intelligence'],
      NOW,
    );
    const old = scoreItem(
      item({ publishedAt: '2026-06-20T00:00:00.000Z' }), // >24h → +0
      ['artificial intelligence'],
      NOW,
    );
    // base = title match only (2); fresh adds +2, old adds +0
    expect(fresh.score).toBe(2 + 2);
    expect(old.score).toBe(2);
  });

  it('is deterministic and pure (does not mutate input)', () => {
    const input = item();
    const scored = scoreItem(input, ['ai'], NOW);
    expect(input.score).toBe(0);
    expect(scored).not.toBe(input);
  });
});

describe('scoreAll', () => {
  it('scores every item', () => {
    const scored = scoreAll(
      [item(), item({ title: 'no match', description: 'none' })],
      ['ai'],
      NOW,
    );
    expect(scored).toHaveLength(2);
  });
});
