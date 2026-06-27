import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { GdeltProvider } from '../../src/providers/gdelt.js';
import type { NewsSearchQuery } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const query: NewsSearchQuery = {
  keywords: ['artificial intelligence', 'language model'],
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
    expect(calledUrl.searchParams.get('query')).toBe(
      '("artificial intelligence" OR "language model")',
    );
    expect(calledUrl.searchParams.get('format')).toBe('json');
    // Uses a relative timespan (clock-skew safe), not an absolute window.
    expect(calledUrl.searchParams.get('timespan')).toMatch(/^\d+[hd]$/);
    expect(calledUrl.searchParams.get('startdatetime')).toBeNull();
  });

  it('drops terms with too-short tokens, quotes the rest, and caps OR clauses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ articles: [] }));
    const provider = new GdeltProvider({ enabled: true, http });

    await provider.search({
      ...query,
      keywords: [
        // Tokenise to a too-short fragment GDELT rejects as "phrase too short":
        'GPT-5', // → GPT + 5
        'Llama 3', // → Llama + 3
        'AI', // 2 chars
        // GDELT-safe terms (every token >= 3 chars):
        'Claude',
        'Gemini',
        'Mistral',
        'Qwen',
        'DeepSeek',
        'fine-tuning',
        'coding assistant',
        'open weights',
        'prompt engineering', // 9th safe term — dropped by the 8-clause cap
      ],
    });

    const q = new URL(String(fetchMock.mock.calls[0]![0])).searchParams.get('query')!;
    // Terms whose tokens are too short never reach GDELT (they would 400 it).
    expect(q).not.toContain('GPT-5');
    expect(q).not.toContain('Llama 3');
    expect(q).not.toContain('"AI"');
    // Hyphenated/multi-word SAFE tokens are quoted (GDELT reads a bare '-' as NOT).
    expect(q).toContain('"fine-tuning"');
    expect(q).toContain('"coding assistant"');
    // Bounded to 8 OR clauses; the 9th safe keyword is dropped.
    expect(q.split(' OR ')).toHaveLength(8);
    expect(q).not.toContain('prompt engineering');
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
