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
    // Every term is quoted (neutralises hyphens GDELT reads as NOT) and OR-ed.
    const calledUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(calledUrl.searchParams.get('query')).toBe('("artificial intelligence" OR "AI")');
    expect(calledUrl.searchParams.get('format')).toBe('json');
    // Uses a relative timespan (clock-skew safe), not an absolute window.
    expect(calledUrl.searchParams.get('timespan')).toMatch(/^\d+[hd]$/);
    expect(calledUrl.searchParams.get('startdatetime')).toBeNull();
  });

  it('quotes hyphenated terms and caps the number of OR clauses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ articles: [] }));
    const provider = new GdeltProvider({ enabled: true, http });

    await provider.search({
      ...query,
      keywords: ['GPT-5', 'GPT-4o', 'Claude', 'Gemini', 'Llama 3', 'Mistral', 'Qwen', 'a', 'b', 'c'],
    });

    const q = new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get('query')!;
    // Hyphenated/multi-word tokens are quoted (GDELT reads a bare '-' as NOT).
    expect(q).toContain('"GPT-5"');
    expect(q).toContain('"Llama 3"');
    // Bounded to 8 OR clauses; the 9th/10th keyword is dropped.
    expect(q.split(' OR ')).toHaveLength(8);
    expect(q).not.toContain('"c"');
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
