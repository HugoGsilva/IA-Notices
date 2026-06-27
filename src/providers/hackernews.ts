import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'hackernews';
const ENDPOINT = 'https://hn.algolia.com/api/v1/search';
/**
 * Only surface stories with at least this many points. Points are HN's primary
 * quality/relevance signal: a genuinely notable model release or technique
 * comfortably clears this bar, while the low-engagement noise that made earlier
 * digests feel "random" does not. Tunable via HACKERNEWS_MIN_POINTS.
 */
const DEFAULT_MIN_POINTS = 50;
/**
 * Algolia's `query` is AND-by-default, so dumping every keyword into one request
 * matches nothing (and an over-long/`optionalWords` request is rejected with a
 * 400). Instead we run one focused search per keyword and merge the results,
 * bounded so the per-run request count stays small. The keyword defaults lead
 * with the most specific, least-ambiguous dev/AI terms so these searches spend
 * their budget on high-signal queries.
 */
const MAX_QUERY_TERMS = 8;

export interface HackerNewsOptions {
  enabled: boolean;
  http: HttpClient;
  logger?: Logger;
  /** Minimum points for a story to be returned. */
  minPoints?: number;
}

/** Relevant subset of an Algolia HN Search response. */
interface HnResponse {
  hits?: Array<{
    objectID?: string;
    title?: string | null;
    url?: string | null;
    points?: number | null;
    num_comments?: number | null;
    created_at?: string | null;
  }>;
}

/**
 * Adapter for the Hacker News Search API powered by Algolia
 * (https://hn.algolia.com/api). No API key required.
 *
 * A developer-focused source: new model releases, tooling and techniques tend
 * to surface here first. Quality is filtered by a points threshold and the
 * window is the standard lookback; relevance is left to the core scorer.
 */
export class HackerNewsProvider implements NewsProvider {
  readonly name = PROVIDER_NAME;
  readonly enabled: boolean;
  private readonly http: HttpClient;
  private readonly logger: Logger;
  private readonly minPoints: number;

  constructor(options: HackerNewsOptions) {
    this.enabled = options.enabled;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
    this.minPoints = options.minPoints ?? DEFAULT_MIN_POINTS;
  }

  async search(query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const terms = query.keywords
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0)
      .slice(0, MAX_QUERY_TERMS);
    const sinceSeconds = Math.floor(query.from.getTime() / 1000);
    const hitsPerPage = Math.min(query.limit, 30);

    // One focused search per keyword; merge and dedup. A failure on a single
    // term is isolated so the rest of the terms (and providers) still proceed.
    const collected = new Map<string, RawNewsItem>();
    for (const term of terms) {
      const url = new URL(ENDPOINT);
      url.searchParams.set('query', term);
      url.searchParams.set('tags', 'story');
      url.searchParams.set('hitsPerPage', String(hitsPerPage));
      // Only the (documented-valid) recency filter goes to Algolia; the points
      // threshold is applied client-side to avoid finicky numericFilters
      // combinations that the HN search frontend rejects with HTTP 400.
      url.searchParams.set('numericFilters', `created_at_i>${sinceSeconds}`);

      try {
        const body = await this.http.getJson<HnResponse>(url.toString());
        for (const hit of body.hits ?? []) {
          if (!hit.title) continue;
          if ((hit.points ?? 0) < this.minPoints) continue;
          const key = hit.objectID ?? hit.url ?? hit.title;
          if (collected.has(key)) continue;
          collected.set(key, {
            title: hit.title,
            // Ask/Show/self posts have no external URL; link to the discussion.
            url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
            source: 'Hacker News',
            publishedAt: hit.created_at ?? undefined,
            description: describePost(hit.points, hit.num_comments),
            language: 'en',
            provider: PROVIDER_NAME,
          });
        }
      } catch (error) {
        this.logger.warn(
          `[${PROVIDER_NAME}] search failed for "${term}" (${maskUrl(url.toString())}): ${describeError(error)}`,
        );
      }
    }

    this.logger.info(`[${PROVIDER_NAME}] received ${collected.size} story(ies)`);
    return [...collected.values()];
  }
}

/** A short, human-readable engagement note used as the item description. */
function describePost(points?: number | null, comments?: number | null): string | undefined {
  if (points == null && comments == null) return undefined;
  return `${points ?? 0} points · ${comments ?? 0} comments on Hacker News`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
