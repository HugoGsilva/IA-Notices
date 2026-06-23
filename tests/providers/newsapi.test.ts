import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { NewsApiProvider } from '../../src/providers/newsapi.js';
import type { NewsSearchQuery } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const query: NewsSearchQuery = {
  keywords: ['artificial intelligence', 'LLM'],
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  limit: 10,
};

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('NewsApiProvider', () => {
  it('is disabled without a key even when the flag is on', () => {
    const provider = new NewsApiProvider({ enabled: true, http });
    expect(provider.enabled).toBe(false);
  });

  it('is enabled with both the flag and a key', () => {
    const provider = new NewsApiProvider({ enabled: true, apiKey: 'k', http });
    expect(provider.enabled).toBe(true);
  });

  it('maps articles and sends the key via header, not the URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        status: 'ok',
        articles: [
          {
            source: { name: 'Example' },
            title: 'Big AI news',
            description: 'desc',
            url: 'https://example.com/a',
            urlToImage: 'https://example.com/a.png',
            publishedAt: '2026-06-23T00:00:00Z',
          },
          { title: 'no url, dropped' },
        ],
      }),
    );
    const provider = new NewsApiProvider({ enabled: true, apiKey: 'secret-key', http });

    const items = await provider.search(query);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Big AI news',
      url: 'https://example.com/a',
      source: 'Example',
      provider: 'newsapi',
    });
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).not.toContain('secret-key');
    expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('secret-key');
  });

  it('isolates errors and never leaks the key in logs', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const warn = vi.fn();
    const provider = new NewsApiProvider({
      enabled: true,
      apiKey: 'secret-key',
      http,
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });

    const items = await provider.search(query);

    expect(items).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).not.toContain('secret-key');
  });
});
