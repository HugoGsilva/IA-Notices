import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'rss';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml';

export interface RssOptions {
  enabled: boolean;
  http: HttpClient;
  logger?: Logger;
  /** Feed URLs (RSS 2.0 or Atom) of official AI blogs/sources. */
  feeds: string[];
}

/**
 * Adapter for RSS 2.0 / Atom feeds — the official-blog channel (OpenAI,
 * Anthropic, Google AI, Hugging Face, …). No key required; feeds are supplied
 * by configuration so the source list is tunable without a rebuild.
 *
 * Parsing is a small, dependency-free reader: it pulls title/link/date/summary
 * from each entry. Per-feed failures are isolated and logged.
 */
export class RssProvider implements NewsProvider {
  readonly name = PROVIDER_NAME;
  readonly enabled: boolean;
  private readonly http: HttpClient;
  private readonly logger: Logger;
  private readonly feeds: string[];

  constructor(options: RssOptions) {
    this.feeds = options.feeds.map((feed) => feed.trim()).filter((feed) => feed.length > 0);
    this.enabled = options.enabled && this.feeds.length > 0;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
  }

  async search(_query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const collected = new Map<string, RawNewsItem>();
    for (const feed of this.feeds) {
      try {
        const response = await this.http.request(feed, { headers: { Accept: ACCEPT } });
        const xml = await response.text();
        const channel = feedTitle(xml);
        for (const entry of parseEntries(xml)) {
          if (!entry.title || !entry.link) continue;
          if (collected.has(entry.link)) continue;
          collected.set(entry.link, {
            title: entry.title,
            url: entry.link,
            source: channel ?? hostOf(feed),
            publishedAt: entry.published,
            description: entry.summary,
            provider: PROVIDER_NAME,
          });
        }
      } catch (error) {
        this.logger.warn(
          `[${PROVIDER_NAME}] fetch failed for ${maskUrl(feed)}: ${describeError(error)}`,
        );
      }
    }

    this.logger.info(`[${PROVIDER_NAME}] received ${collected.size} entr(ies)`);
    return [...collected.values()];
  }
}

interface FeedEntry {
  title?: string;
  link?: string;
  published?: string;
  summary?: string;
}

/** Split a feed into its `<item>` (RSS) or `<entry>` (Atom) blocks and parse each. */
function parseEntries(xml: string): FeedEntry[] {
  const blocks = matchAll(xml, /<(item|entry)\b[\s\S]*?<\/\1>/gi);
  return blocks.map((block) => ({
    title: tagText(block, 'title'),
    link: entryLink(block),
    published: toIso(
      tagText(block, 'pubDate') ?? tagText(block, 'published') ?? tagText(block, 'updated'),
    ),
    summary: stripHtml(
      tagText(block, 'description') ?? tagText(block, 'summary') ?? tagText(block, 'content'),
    ),
  }));
}

/** Resolve the entry URL from an RSS `<link>` body or an Atom `<link href>`. */
function entryLink(block: string): string | undefined {
  // Atom: prefer rel="alternate" (or an unspecified rel) over self/edit links.
  const hrefs = matchAll(block, /<link\b([^>]*)\/?>(?:<\/link>)?/gi).map(
    (m) => /<link\b([^>]*)/i.exec(m)?.[1] ?? '',
  );
  for (const attrs of hrefs) {
    const rel = /\brel=["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    const href = /\bhref=["']?([^"'\s>]+)/i.exec(attrs)?.[1];
    if (href && (!rel || rel === 'alternate')) return decode(href);
  }
  // RSS: <link>https://…</link>
  const rss = tagText(block, 'link');
  if (rss) return rss;
  // Fallback: a GUID that happens to be a URL.
  const guid = tagText(block, 'guid');
  return guid && /^https?:\/\//i.test(guid) ? guid : undefined;
}

/** The channel/feed title, used as the item source label. */
function feedTitle(xml: string): string | undefined {
  // The first <title> before any item/entry is the channel/feed title.
  const head = xml.split(/<(?:item|entry)\b/i)[0] ?? xml;
  return tagText(head, 'title');
}

/** Extract and clean the text content of the first `<tag>…</tag>` in `xml`. */
function tagText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (!match) return undefined;
  const value = stripCdata(match[1] ?? '').trim();
  return value ? decode(value) : undefined;
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/** Strip HTML tags from a (already CDATA-cleaned) description and compact it. */
function stripHtml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}

/** Decode the handful of XML/HTML entities that appear in feed text. */
function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/** All full matches of a global regex (avoids stateful `.exec` loops). */
function matchAll(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
