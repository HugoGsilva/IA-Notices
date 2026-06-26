import type { NewsItem, RawNewsItem } from '../domain/types.js';

/** Query params that are tracking noise and must not affect the dedup key. */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$)/i;

/**
 * Canonicalise a URL for deduplication: lowercase host, drop the fragment and
 * tracking query params, and strip a trailing slash. Returns the original
 * string when it cannot be parsed.
 */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.host = parsed.host.toLowerCase();
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
    }
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

/** Lowercased, whitespace-collapsed title used as a dedup fallback. */
function normalizeTitleForKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Stable deduplication key. Prefers the canonical URL; falls back to the
 * normalised title when the URL is missing/unpar, so two articles at the same
 * URL collapse regardless of tracking params or casing.
 */
export function makeDedupKey(item: Pick<RawNewsItem, 'url' | 'title'>): string {
  const url = item.url?.trim();
  if (url) return `url:${canonicalizeUrl(url)}`;
  return `title:${normalizeTitleForKey(item.title)}`;
}

/** Normalise an ISO-8601-ish timestamp to a canonical ISO string, or null. */
function normalizePublishedAt(value: string | undefined): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const trimOrNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Convert a provider's raw item into the internal `NewsItem`. Scoring and
 * categorisation are left to the scorer (score starts at 0, no categories).
 */
export function normalizeItem(raw: RawNewsItem, now: Date): NewsItem {
  return {
    title: raw.title.trim(),
    url: raw.url.trim(),
    source: trimOrNull(raw.source),
    publishedAt: normalizePublishedAt(raw.publishedAt),
    description: trimOrNull(raw.description),
    imageUrl: trimOrNull(raw.imageUrl),
    language: trimOrNull(raw.language),
    provider: raw.provider,
    score: 0,
    categories: [],
    dedupKey: makeDedupKey(raw),
    fetchedAt: now.toISOString(),
  };
}

/** Normalise a batch, dropping items without a title or URL. */
export function normalizeAll(raws: RawNewsItem[], now: Date): NewsItem[] {
  return raws
    .filter((raw) => raw.title?.trim() && raw.url?.trim())
    .map((raw) => normalizeItem(raw, now));
}
