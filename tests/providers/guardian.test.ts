import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { GuardianProvider } from '../../src/providers/guardian.js';
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

describe('GuardianProvider', () => {
  it('is disabled without a key even when the flag is on', () => {
    const provider = new GuardianProvider({ enabled: true, http });
    expect(provider.enabled).toBe(false);
  });

  it('is enabled with both the flag and a key', () => {
    const provider = new GuardianProvider({ enabled: true, apiKey: 'k', http });
    expect(provider.enabled).toBe(true);
  });

  it('maps results and sends the key as the api-key query parameter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        response: {
          status: 'ok',
          results: [
            {
              webTitle: 'Big AI news',
              webUrl: 'https://theguardian.com/a',
              webPublicationDate: '2026-06-23T00:00:00Z',
              sectionName: 'Technology',
              fields: { trailText: 'desc', thumbnail: 'https://theguardian.com/a.png' },
            },
            { webTitle: 'no url, dropped' },
          ],
        },
      }),
    );
    const provider = new GuardianProvider({ enabled: true, apiKey: 'secret-key', http });

    const items = await provider.search(query);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Big AI news',
      url: 'https://theguardian.com/a',
      source: 'The Guardian',
      description: 'desc',
      imageUrl: 'https://theguardian.com/a.png',
      provider: 'guardian',
    });
    const [calledUrl] = fetchMock.mock.calls[0]!;
    expect(new URL(String(calledUrl)).searchParams.get('api-key')).toBe('secret-key');
  });

  it('returns an empty array when there are no results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ response: { results: [] } }));
    const provider = new GuardianProvider({ enabled: true, apiKey: 'k', http });

    expect(await provider.search(query)).toEqual([]);
  });

  it('isolates errors and never leaks the key in logs', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const warn = vi.fn();
    const provider = new GuardianProvider({
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
