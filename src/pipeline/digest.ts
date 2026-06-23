import type { NewsItem } from '../domain/types.js';

/** Discord limits we must respect when building a webhook message. */
const MAX_EMBEDS = 10;
const TITLE_LIMIT = 256;
const DESCRIPTION_LIMIT = 1000; // Well under Discord's 4096; keeps digests tight.
const FOOTER_LIMIT = 2048;

export interface DiscordEmbed {
  title: string;
  url: string;
  description?: string;
  timestamp?: string;
  footer?: { text: string };
  image?: { url: string };
}

export interface DiscordDigestPayload {
  content: string;
  embeds: DiscordEmbed[];
}

export interface DigestOptions {
  /** Maximum number of embeds (capped at Discord's hard limit of 10). */
  maxEmbeds?: number;
}

/**
 * Build a Discord webhook payload from curated items, highest score first.
 * Returns `null` when there is nothing to deliver, so callers can skip sending.
 */
export function buildDigest(
  items: NewsItem[],
  options: DigestOptions = {},
): DiscordDigestPayload | null {
  if (items.length === 0) return null;

  const limit = Math.min(options.maxEmbeds ?? MAX_EMBEDS, MAX_EMBEDS);
  const top = [...items].sort(compareForDigest).slice(0, limit);

  const embeds = top.map((item) => toEmbed(item));
  const content = `🗞️ AI news digest — ${top.length} ${top.length === 1 ? 'story' : 'stories'}`;

  return { content, embeds };
}

/** Sort by score (desc), then most recent, then title for a stable order. */
function compareForDigest(a: NewsItem, b: NewsItem): number {
  if (a.score !== b.score) return b.score - a.score;
  const pubDiff = publishedTime(b) - publishedTime(a);
  if (pubDiff !== 0) return pubDiff;
  return a.title.localeCompare(b.title);
}

function toEmbed(item: NewsItem): DiscordEmbed {
  const embed: DiscordEmbed = {
    title: truncate(item.title, TITLE_LIMIT),
    url: item.url,
  };
  if (item.description) embed.description = truncate(item.description, DESCRIPTION_LIMIT);
  if (item.publishedAt) embed.timestamp = item.publishedAt;
  if (item.source) embed.footer = { text: truncate(item.source, FOOTER_LIMIT) };
  if (item.imageUrl) embed.image = { url: item.imageUrl };
  return embed;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function publishedTime(item: NewsItem): number {
  if (!item.publishedAt) return 0;
  const time = Date.parse(item.publishedAt);
  return Number.isNaN(time) ? 0 : time;
}
