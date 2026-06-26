import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { HackerNewsProvider } from '../../src/providers/hackernews.js';
import type { NewsSearchQuery } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const query: NewsSearchQuery = {
  keywords: ['LLM', 'model release'],
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  limit: 10,
};

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('HackerNewsProvider', () => {
  it('is disabled by default and runnable when enabled', () => {
    expect(new HackerNewsProvider({ enabled: false, http }).enabled).toBe(false);
    expect(new HackerNewsProvider({ enabled: true, http }).enabled).toBe(true);
  });

  it('maps stories and filters by time window and points', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        hits: [
          {
            objectID: '1',
            title: 'New open-source LLM released',
            url: 'https://example.com/llm',
            points: 240,
            num_comments: 88,
            created_at: '2026-06-23T10:00:00Z',
          },
          { objectID: '2', title: 'Ask HN: best local model?', points: 50, num_comments: 30 },
        ],
      }),
    );
    const provider = new HackerNewsProvider({ enabled: true, http });

    const items = await provider.search(query);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'New open-source LLM released',
      url: 'https://example.com/llm',
      source: 'Hacker News',
      provider: 'hackernews',
    });
    // Self/Ask posts with no URL fall back to the HN discussion link.
    expect(items[1]!.url).toBe('https://news.ycombinator.com/item?id=2');

    const calledUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(calledUrl.searchParams.get('tags')).toBe('story');
    expect(calledUrl.searchParams.get('numericFilters')).toContain('points>=10');
    expect(calledUrl.searchParams.get('numericFilters')).toContain('created_at_i>');
  });

  it('isolates errors and returns []', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const warn = vi.fn();
    const provider = new HackerNewsProvider({
      enabled: true,
      http,
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });

    expect(await provider.search(query)).toEqual([]);
    // One focused search per keyword, each failure isolated and logged.
    expect(warn).toHaveBeenCalled();
  });

  it('runs one focused search per keyword (no AND-dump) and dedups hits', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        hits: [
          {
            objectID: '1',
            title: 'New open-source LLM released',
            url: 'https://example.com/llm',
            points: 240,
            num_comments: 88,
            created_at: '2026-06-23T10:00:00Z',
          },
        ],
      }),
    );
    const provider = new HackerNewsProvider({ enabled: true, http });

    const items = await provider.search(query);

    // Two keywords → two requests, each a single focused term (not a dump).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get('query')).toBe('LLM');
    expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get('query')).toBe(
      'model release',
    );
    // optionalWords (the Algolia 400 culprit) is no longer sent.
    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.has('optionalWords')).toBe(
      false,
    );
    // The same story returned by both terms is deduped by objectID.
    expect(items).toHaveLength(1);
  });
});
