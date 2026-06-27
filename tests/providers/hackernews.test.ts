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
          // Below the points threshold — dropped client-side.
          { objectID: '3', title: 'Low-signal post', points: 2, num_comments: 0 },
        ],
      }),
    );
    const provider = new HackerNewsProvider({ enabled: true, http });

    const items = await provider.search(query);

    // The 2-point story is filtered out; the two quality stories remain.
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
    // Only the recency filter is sent to Algolia (points are filtered locally).
    expect(calledUrl.searchParams.get('numericFilters')).toBe(
      `created_at_i>${Math.floor(query.from.getTime() / 1000)}`,
    );
  });

  it('applies the points quality gate (default 30, configurable)', async () => {
    const hits = {
      hits: [
        { objectID: '1', title: 'Big launch', url: 'https://example.com/a', points: 120 },
        { objectID: '2', title: 'Low-signal post', url: 'https://example.com/b', points: 12 },
      ],
    };
    // Fresh Response per call: a Response body can only be read once, and each
    // search issues one fetch per keyword.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(okResponse(hits)));

    // Default threshold (30) drops the 12-point story.
    const strict = await new HackerNewsProvider({ enabled: true, http }).search(query);
    expect(strict.map((item) => item.title)).toEqual(['Big launch']);

    // A lower configured threshold lets it through.
    const lenient = await new HackerNewsProvider({ enabled: true, http, minPoints: 10 }).search(
      query,
    );
    expect(lenient.map((item) => item.title)).toEqual(['Big launch', 'Low-signal post']);
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
