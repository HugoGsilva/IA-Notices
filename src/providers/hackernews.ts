import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'hackernews';
const ENDPOINT = 'https://hn.algolia.com/api/v1/search';
/** Only surface stories with at least this many points (a quality signal). */
const DEFAULT_MIN_POINTS = 10;

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
    const terms = query.keywords.join(' ');
    const url = new URL(ENDPOINT);
    url.searchParams.set('query', terms);
    // Any keyword may match (OR-like), ranked by relevance.
    url.searchParams.set('optionalWords', terms);
    url.searchParams.set('tags', 'story');
    url.searchParams.set('hitsPerPage', String(Math.min(query.limit, 50)));
    const sinceSeconds = Math.floor(query.from.getTime() / 1000);
    url.searchParams.set(
      'numericFilters',
      `created_at_i>${sinceSeconds},points>=${this.minPoints}`,
    );

    try {
      const body = await this.http.getJson<HnResponse>(url.toString());
      const hits = body.hits ?? [];
      this.logger.info(`[${PROVIDER_NAME}] received ${hits.length} story(ies)`);
      return hits
        .filter((hit) => hit.title)
        .map((hit) => ({
          title: hit.title!,
          // Ask/Show/self posts have no external URL; link to the discussion.
          url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
          source: 'Hacker News',
          publishedAt: hit.created_at ?? undefined,
          description: describePost(hit.points, hit.num_comments),
          language: 'en',
          provider: PROVIDER_NAME,
        }));
    } catch (error) {
      this.logger.warn(
        `[${PROVIDER_NAME}] search failed for ${maskUrl(url.toString())}: ${describeError(error)}`,
      );
      return [];
    }
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
