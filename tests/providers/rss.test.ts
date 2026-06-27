import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/http/client.js';
import { RssProvider } from '../../src/providers/rss.js';
import type { NewsSearchQuery } from '../../src/domain/types.js';

afterEach(() => vi.restoreAllMocks());

const http = new HttpClient({ timeoutMs: 1000, retries: 0 });
const query: NewsSearchQuery = {
  keywords: ['LLM'],
  from: new Date('2026-06-01T00:00:00.000Z'),
  language: 'en',
  limit: 10,
};

const xmlResponse = (xml: string): Response =>
  new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>OpenAI Blog</title>
  <item>
    <title><![CDATA[Introducing GPT-5]]></title>
    <link>https://openai.com/blog/gpt-5</link>
    <pubDate>Thu, 26 Jun 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[<p>We are <b>excited</b> to launch GPT-5 &amp; more.</p>]]></description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>HF Blog</title>
  <entry>
    <title>New open model</title>
    <link rel="alternate" href="https://huggingface.co/blog/new-model"/>
    <updated>2026-06-25T08:00:00Z</updated>
    <summary>A short summary.</summary>
  </entry>
</feed>`;

describe('RssProvider', () => {
  it('is disabled without feeds even when enabled', () => {
    expect(new RssProvider({ enabled: true, http, feeds: [] }).enabled).toBe(false);
    expect(new RssProvider({ enabled: true, http, feeds: ['https://x/feed'] }).enabled).toBe(true);
  });

  it('parses an RSS 2.0 feed, stripping CDATA/HTML and decoding entities', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(xmlResponse(RSS));
    const provider = new RssProvider({ enabled: true, http, feeds: ['https://openai.com/rss'] });

    const items = await provider.search(query);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Introducing GPT-5',
      url: 'https://openai.com/blog/gpt-5',
      source: 'OpenAI Blog',
      description: 'We are excited to launch GPT-5 & more.',
      provider: 'rss',
    });
    expect(items[0]!.publishedAt).toBe('2026-06-26T10:00:00.000Z');
  });

  it('parses an Atom feed (link href + summary)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(xmlResponse(ATOM));
    const provider = new RssProvider({
      enabled: true,
      http,
      feeds: ['https://huggingface.co/rss'],
    });

    const items = await provider.search(query);

    expect(items[0]).toMatchObject({
      title: 'New open model',
      url: 'https://huggingface.co/blog/new-model',
      source: 'HF Blog',
      description: 'A short summary.',
    });
  });

  it('merges multiple feeds, dedups by link, and isolates failures', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(xmlResponse(RSS))
      .mockRejectedValueOnce(new Error('feed down'))
      .mockResolvedValueOnce(xmlResponse(RSS));
    const warn = vi.fn();
    const provider = new RssProvider({
      enabled: true,
      http,
      feeds: ['https://a/rss', 'https://b/rss', 'https://c/rss'],
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    });

    const items = await provider.search(query);
    // Same link from feeds a and c collapses to one; b failed but was isolated.
    expect(items).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});
