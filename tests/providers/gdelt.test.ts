import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { GdeltProvider } from '../../src/providers/gdelt.js';
import type { NewsSearchQuery } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const query: NewsSearchQuery = {
  keywords: ['artificial intelligence', 'AI'],
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  limit: 5,
};

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('GdeltProvider', () => {
  it('maps articles and parses the seendate', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        articles: [
          {
            url: 'https://example.com/g',
            title: 'GDELT story',
            seendate: '20260623T120000Z',
            socialimage: 'https://example.com/g.png',
            domain: 'example.com',
            language: 'English',
          },
        ],
      }),
    );
    const provider = new GdeltProvider({ enabled: true, http });

    const items = await provider.search(query);

    expect(items[0]).toMatchObject({
      title: 'GDELT story',
      url: 'https://example.com/g',
      source: 'example.com',
      publishedAt: '2026-06-23T12:00:00.000Z',
      provider: 'gdelt',
    });
    // Multi-word keyword is quoted and OR-ed.
    const calledUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(calledUrl.searchParams.get('query')).toBe('("artificial intelligence" OR AI)');
    expect(calledUrl.searchParams.get('format')).toBe('json');
  });

  it('returns [] on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({}));
    const provider = new GdeltProvider({ enabled: true, http });
    await expect(provider.search(query)).resolves.toEqual([]);
  });

  it('isolates network failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const provider = new GdeltProvider({ enabled: true, http });
    await expect(provider.search(query)).resolves.toEqual([]);
  });
});
