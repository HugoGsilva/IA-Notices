import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { HuggingFaceProvider } from '../../src/providers/huggingface.js';
import type { NewsSearchQuery } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const query: NewsSearchQuery = {
  keywords: ['LLM'],
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  limit: 50,
};

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('HuggingFaceProvider', () => {
  it('maps daily papers to items with a papers URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse([
        {
          publishedAt: '2026-06-26T00:00:00.000Z',
          paper: {
            id: '2406.12345',
            title: 'A Better Way to Fine-tune LLMs',
            summary: '  We propose   a method.  ',
            upvotes: 42,
          },
        },
        // No id → skipped (cannot build a stable URL).
        { paper: { title: 'No id', upvotes: 10 } },
      ]),
    );
    const provider = new HuggingFaceProvider({ enabled: true, http });

    const items = await provider.search(query);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'A Better Way to Fine-tune LLMs',
      url: 'https://huggingface.co/papers/2406.12345',
      source: 'Hugging Face Papers',
      description: 'We propose a method.',
      provider: 'huggingface',
    });
  });

  it('applies an optional upvote gate', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse([
        { paper: { id: '1', title: 'Hot', upvotes: 30 } },
        { paper: { id: '2', title: 'Cold', upvotes: 1 } },
      ]),
    );
    const provider = new HuggingFaceProvider({ enabled: true, http, minUpvotes: 10 });

    const items = await provider.search(query);
    expect(items.map((item) => item.title)).toEqual(['Hot']);
  });

  it('isolates errors and returns []', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const provider = new HuggingFaceProvider({ enabled: true, http });
    await expect(provider.search(query)).resolves.toEqual([]);
  });
});
