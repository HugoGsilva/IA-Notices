import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'reddit';
/** Only surface posts with at least this many upvotes (a quality signal). */
const DEFAULT_MIN_UPVOTES = 25;
/**
 * Reddit rejects requests with a generic/empty User-Agent (HTTP 429/403). A
 * descriptive UA is required by their API etiquette.
 */
const USER_AGENT = 'IA-Notices/1.0 (AI news aggregator)';

export interface RedditOptions {
  enabled: boolean;
  http: HttpClient;
  logger?: Logger;
  /** Subreddits to pull "top" listings from (without the `r/` prefix). */
  subreddits: string[];
  /** Minimum upvotes for a post to be returned. */
  minUpvotes?: number;
  /** Listing window passed to Reddit's `t` param (e.g. `day`, `week`). */
  listing?: string;
}

/** Relevant subset of a Reddit listing response. */
interface RedditListing {
  data?: {
    children?: Array<{
      data?: {
        title?: string | null;
        url?: string | null;
        permalink?: string | null;
        score?: number | null;
        num_comments?: number | null;
        created_utc?: number | null;
        subreddit?: string | null;
        is_self?: boolean | null;
        stickied?: boolean | null;
        over_18?: boolean | null;
      };
    }>;
  };
}

/**
 * Adapter for Reddit's public JSON listings (`/r/<sub>/top.json`). No key
 * required.
 *
 * A high-signal developer/AI source: communities like r/LocalLLaMA and
 * r/MachineLearning surface new models, tooling and techniques. Quality is
 * gated by an upvote threshold; relevance is left to the core scorer.
 */
export class RedditProvider implements NewsProvider {
  readonly name = PROVIDER_NAME;
  readonly enabled: boolean;
  private readonly http: HttpClient;
  private readonly logger: Logger;
  private readonly subreddits: string[];
  private readonly minUpvotes: number;
  private readonly listing: string;

  constructor(options: RedditOptions) {
    this.subreddits = options.subreddits
      .map((sub) => sub.trim().replace(/^\/?r\//i, ''))
      .filter((sub) => sub.length > 0);
    // Disabled unless turned on AND at least one subreddit is configured.
    this.enabled = options.enabled && this.subreddits.length > 0;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
    this.minUpvotes = options.minUpvotes ?? DEFAULT_MIN_UPVOTES;
    this.listing = options.listing ?? 'day';
  }

  async search(query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const limit = Math.min(query.limit, 25);

    // One listing per subreddit; merge and dedup. A failure on a single
    // subreddit is isolated so the rest (and other providers) still proceed.
    const collected = new Map<string, RawNewsItem>();
    for (const sub of this.subreddits) {
      const url = new URL(`https://www.reddit.com/r/${sub}/top.json`);
      url.searchParams.set('t', this.listing);
      url.searchParams.set('limit', String(limit));

      try {
        const body = await this.http.getJson<RedditListing>(url.toString(), {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        });
        for (const child of body.data?.children ?? []) {
          const post = child.data;
          if (!post?.title || !post.permalink) continue;
          if (post.stickied || post.over_18) continue;
          if ((post.score ?? 0) < this.minUpvotes) continue;

          const discussion = `https://www.reddit.com${post.permalink}`;
          // Link posts point at the external article; self/text posts have no
          // external URL, so fall back to the discussion thread.
          const external =
            post.url && !post.is_self && !/reddit\.com|redd\.it/i.test(post.url)
              ? post.url
              : discussion;

          const key = discussion;
          if (collected.has(key)) continue;
          collected.set(key, {
            title: post.title,
            url: external,
            source: `r/${post.subreddit ?? sub}`,
            publishedAt: toIso(post.created_utc),
            description: describePost(post.score, post.num_comments, post.subreddit ?? sub),
            language: 'en',
            provider: PROVIDER_NAME,
          });
        }
      } catch (error) {
        this.logger.warn(
          `[${PROVIDER_NAME}] listing failed for r/${sub} (${maskUrl(url.toString())}): ${describeError(error)}`,
        );
      }
    }

    this.logger.info(`[${PROVIDER_NAME}] received ${collected.size} post(s)`);
    return [...collected.values()];
  }
}

/** A short, human-readable engagement note used as the item description. */
function describePost(
  score?: number | null,
  comments?: number | null,
  subreddit?: string | null,
): string {
  return `${score ?? 0} upvotes · ${comments ?? 0} comments on r/${subreddit ?? '?'}`;
}

/** Reddit timestamps are Unix seconds (UTC). */
function toIso(createdUtc?: number | null): string | undefined {
  if (createdUtc == null || !Number.isFinite(createdUtc)) return undefined;
  return new Date(createdUtc * 1000).toISOString();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
