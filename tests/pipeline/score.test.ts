import { describe, expect, it } from 'vitest';
import { scoreAll, scoreItem } from '../../src/pipeline/score.js';
import type { NewsItem } from '../../src/domain/types.js';

const NOW = new Date('2026-06-23T12:00:00.000Z');

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'OpenAI releases GPT-5',
    url: 'https://openai.com/news/gpt-5',
    source: 'OpenAI',
    publishedAt: null,
    description: 'A new language model is now available.',
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
  it('gives more weight to specific AI keywords and concrete news signals', () => {
    const scored = scoreItem(item(), ['OpenAI', 'GPT-5'], NOW);
    // OpenAI title (3) + GPT-5 title (3) + release (2.5) + version (1) + trusted source (1.5) + recent (2)
    expect(scored.score).toBe(12);
    expect(scored.categories).toEqual(['openai', 'gpt-5']);
  });

  it('keeps generic matches weak so a bare AI mention cannot qualify by itself', () => {
    const scored = scoreItem(
      item({
        title: 'AI model discussed online',
        url: 'https://example.com/a',
        source: 'Example',
        description: 'People talk about artificial intelligence.',
        publishedAt: '2026-06-23T09:00:00.000Z',
      }),
      ['ai'],
      NOW,
    );
    expect(scored.score).toBe(3);
    expect(scored.categories).toEqual(['ai']);
  });

  it('scores zero when no keyword matches and no quality signals are present', () => {
    const scored = scoreItem(
      item({ title: 'cooking recipes', description: 'pasta', url: 'https://example.com/a', source: 'Example' }),
      ['ai'],
      NOW,
    );
    expect(scored.score).toBe(0);
    expect(scored.categories).toEqual([]);
  });

  it('matches whole words only — no substring false positives', () => {
    const scored = scoreItem(
      item({
        title: 'Rain in Spain stays available',
        description: 'maintain the campaign',
        url: 'https://example.com/a',
        source: 'Example',
      }),
      ['ai'],
      NOW,
    );
    expect(scored.score).toBe(0);
    expect(scored.categories).toEqual([]);
  });

  it('matches a standalone short keyword', () => {
    const scored = scoreItem(
      item({
        title: 'AI discussion online',
        description: 'none',
        url: 'https://example.com/a',
        source: 'Example',
      }),
      ['ai'],
      NOW,
    );
    expect(scored.score).toBe(3);
    expect(scored.categories).toEqual(['ai']);
  });

  it('adds a recency bonus only after a keyword match', () => {
    const fresh = scoreItem(
      item({
        title: 'New GPT-5 release',
        publishedAt: '2026-06-23T09:00:00.000Z',
        url: 'https://example.com/a',
        source: 'Example',
      }),
      ['GPT-5'],
      NOW,
    );
    const old = scoreItem(
      item({
        title: 'New GPT-5 release',
        publishedAt: '2026-06-20T00:00:00.000Z',
        url: 'https://example.com/a',
        source: 'Example',
      }),
      ['GPT-5'],
      NOW,
    );
    expect(fresh.score).toBe(9.5);
    expect(old.score).toBe(7.5);
  });

  it('penalises obvious slop even when it contains a strong AI keyword', () => {
    const scored = scoreItem(
      item({
        title: '10 AI tools you need to try this week',
        url: 'https://example.com/a',
        source: 'Example',
      }),
      ['AI'],
      NOW,
    );
    expect(scored.score).toBeLessThan(5);
  });

  it('is deterministic and pure (does not mutate input)', () => {
    const input = item();
    const scored = scoreItem(input, ['GPT-5'], NOW);
    expect(input.score).toBe(0);
    expect(scored).not.toBe(input);
  });
});

describe('scoreAll', () => {
  it('scores every item', () => {
    const scored = scoreAll(
      [item(), item({ title: 'no match', description: 'none', url: 'https://example.com/b', source: 'Example' })],
      ['AI'],
      NOW,
    );
    expect(scored).toHaveLength(2);
  });
});
