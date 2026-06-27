import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { RedditProvider } from '../../src/providers/reddit.js';
import type { NewsSearchQuery } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const query: NewsSearchQuery = {
  keywords: ['LLM'],
  from: new Date('2026-06-22T00:00:00.000Z'),
  language: 'en',
  limit: 10,
};

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const post = (over: Record<string, unknown>) => ({
  data: {
    title: 'A post',
    permalink: '/r/LocalLLaMA/comments/x/a_post/',
    score: 100,
    num_comments: 20,
    created_utc: 1_750_000_000,
    subreddit: 'LocalLLaMA',
    is_self: false,
    stickied: false,
    over_18: false,
    ...over,
  },
});

describe('RedditProvider', () => {
  it('is disabled without subreddits even when enabled', () => {
    expect(new RedditProvider({ enabled: true, http, subreddits: [] }).enabled).toBe(false);
    expect(new RedditProvider({ enabled: true, http, subreddits: ['LocalLLaMA'] }).enabled).toBe(
      true,
    );
    expect(new RedditProvider({ enabled: false, http, subreddits: ['LocalLLaMA'] }).enabled).toBe(
      false,
    );
  });

  it('maps posts, filters by upvotes, and skips stickied/NSFW', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        data: {
          children: [
            post({ title: 'New LLM', url: 'https://example.com/llm', score: 250 }),
            post({
              title: 'Low',
              url: 'https://example.com/low',
              score: 5,
              permalink: '/r/x/low/',
            }),
            post({ title: 'Pinned', score: 999, stickied: true, permalink: '/r/x/pin/' }),
            post({ title: 'NSFW', score: 999, over_18: true, permalink: '/r/x/nsfw/' }),
          ],
        },
      }),
    );
    const provider = new RedditProvider({
      enabled: true,
      http,
      subreddits: ['LocalLLaMA'],
      minUpvotes: 25,
    });

    const items = await provider.search(query);

    // Only the 250-point SFW, non-pinned post survives.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'New LLM',
      url: 'https://example.com/llm',
      source: 'r/LocalLLaMA',
      provider: 'reddit',
    });
    // A descriptive User-Agent is sent (Reddit blocks generic UAs).
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/IA-Notices/);
  });

  it('links self/text posts to the discussion thread', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({
        data: {
          children: [
            post({
              title: 'Ask: best local model?',
              is_self: true,
              url: 'https://www.reddit.com/r/LocalLLaMA/comments/x/a_post/',
              permalink: '/r/LocalLLaMA/comments/x/a_post/',
            }),
          ],
        },
      }),
    );
    const provider = new RedditProvider({ enabled: true, http, subreddits: ['LocalLLaMA'] });

    const items = await provider.search(query);
    expect(items[0]!.url).toBe('https://www.reddit.com/r/LocalLLaMA/comments/x/a_post/');
  });

  it('queries each subreddit and isolates failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse({ data: { children: [post({ title: 'ok', score: 80 })] } }))
      .mockRejectedValueOnce(new Error('boom'));
    const warn = vi.fn();
    const provider = new RedditProvider({
      enabled: true,
      http,
      subreddits: ['LocalLLaMA', 'MachineLearning'],
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });

    const items = await provider.search(query);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});
