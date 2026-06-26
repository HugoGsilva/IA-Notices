import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { DiscordWebhookNotifier } from '../../src/discord/webhook-notifier.js';
import { noopLogger } from '../../src/logging/logger.js';
import type { NewsItem } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const WEBHOOK = 'https://discord.com/api/webhooks/123/secret-token';

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: 'AI news',
    url: 'https://example.com/a',
    source: 'Example',
    publishedAt: '2026-06-23T00:00:00.000Z',
    description: 'desc',
    imageUrl: null,
    language: null,
    provider: 'p',
    score: 5,
    categories: [],
    dedupKey: 'k',
    fetchedAt: '2026-06-23T01:00:00.000Z',
    ...overrides,
  };
}

describe('DiscordWebhookNotifier', () => {
  it('is disabled without a webhook URL even when the flag is on', () => {
    const notifier = new DiscordWebhookNotifier({ enabled: true, http });
    expect(notifier.enabled).toBe(false);
  });

  it('is a no-op when disabled and never calls fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const notifier = new DiscordWebhookNotifier({ enabled: false, webhookUrl: WEBHOOK, http });

    const result = await notifier.notify([item()]);

    expect(result).toEqual({ delivered: false, itemCount: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send when there are no items', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const notifier = new DiscordWebhookNotifier({ enabled: true, webhookUrl: WEBHOOK, http });

    const result = await notifier.notify([]);

    expect(result).toEqual({ delivered: false, itemCount: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the digest as JSON to the webhook', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const notifier = new DiscordWebhookNotifier({ enabled: true, webhookUrl: WEBHOOK, http });

    const result = await notifier.notify([item(), item({ dedupKey: 'k2' })]);

    expect(result.delivered).toBe(true);
    expect(result.itemCount).toBe(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(WEBHOOK);
    expect(init?.method).toBe('POST');
    const payload = JSON.parse(String(init?.body));
    expect(payload.embeds).toHaveLength(2);
  });

  it('isolates delivery errors and never logs the webhook URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('discord down'));
    const warn = vi.fn();
    const notifier = new DiscordWebhookNotifier({
      enabled: true,
      webhookUrl: WEBHOOK,
      http,
      logger: { ...noopLogger, warn },
    });

    const result = await notifier.notify([item()]);

    expect(result).toEqual({ delivered: false, itemCount: 0 });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).not.toContain('secret-token');
    expect(warn.mock.calls[0]![0]).not.toContain('discord.com');
  });
});
