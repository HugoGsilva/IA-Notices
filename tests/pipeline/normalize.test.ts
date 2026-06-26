import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  makeDedupKey,
  normalizeAll,
  normalizeItem,
} from '../../src/pipeline/normalize.js';
import type { RawNewsItem } from '../../src/domain/types.js';

const NOW = new Date('2026-06-23T12:00:00.000Z');

describe('canonicalizeUrl', () => {
  it('drops tracking params, fragment and trailing slash', () => {
    expect(canonicalizeUrl('https://Example.com/path/?utm_source=x&id=5#frag')).toBe(
      'https://example.com/path?id=5',
    );
  });

  it('returns the input when it is not a valid URL', () => {
    expect(canonicalizeUrl('not a url')).toBe('not a url');
  });
});

describe('makeDedupKey', () => {
  it('uses the canonical URL so tracking variants collapse', () => {
    const a = makeDedupKey({ url: 'https://example.com/p?utm_source=a', title: 'X' });
    const b = makeDedupKey({ url: 'https://example.com/p', title: 'Y' });
    expect(a).toBe(b);
  });

  it('falls back to the normalised title without a URL', () => {
    expect(makeDedupKey({ url: '', title: '  Big   AI  News ' })).toBe('title:big ai news');
  });
});

describe('normalizeItem', () => {
  const raw: RawNewsItem = {
    title: '  AI breakthrough  ',
    url: ' https://example.com/a ',
    source: ' Example ',
    publishedAt: '2026-06-23T00:00:00Z',
    description: undefined,
    provider: 'newsapi',
  };

  it('trims fields, defaults score/categories and stamps fetchedAt', () => {
    const item = normalizeItem(raw, NOW);
    expect(item.title).toBe('AI breakthrough');
    expect(item.url).toBe('https://example.com/a');
    expect(item.source).toBe('Example');
    expect(item.description).toBeNull();
    expect(item.publishedAt).toBe('2026-06-23T00:00:00.000Z');
    expect(item.score).toBe(0);
    expect(item.categories).toEqual([]);
    expect(item.fetchedAt).toBe(NOW.toISOString());
  });

  it('nulls out an unparseable publishedAt', () => {
    const item = normalizeItem({ ...raw, publishedAt: 'whenever' }, NOW);
    expect(item.publishedAt).toBeNull();
  });
});

describe('normalizeAll', () => {
  it('drops items missing a title or URL', () => {
    const items = normalizeAll(
      [
        { title: 'ok', url: 'https://example.com/ok', provider: 'p' },
        { title: '', url: 'https://example.com/x', provider: 'p' },
        { title: 'no url', url: '', provider: 'p' },
      ],
      NOW,
    );
    expect(items.map((i) => i.title)).toEqual(['ok']);
  });
});
