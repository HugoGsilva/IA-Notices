import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'gdelt';
const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const HOUR_MS = 60 * 60 * 1000;
/**
 * GDELT rejects very long boolean queries (and returns a plain-text error, not
 * JSON). Bound the number of OR clauses to stay comfortably within its limits.
 */
const MAX_QUERY_TERMS = 8;
/**
 * GDELT rejects any term shorter than this with "The specified phrase is too
 * short." Quoting a token like `GPT-5` makes GDELT tokenise it into `GPT` + `5`,
 * and the lone `5` trips that error — poisoning the whole request. So we only
 * pass keywords whose every word-token clears this length.
 */
const MIN_TERM_LENGTH = 3;

export interface GdeltOptions {
  enabled: boolean;
  http: HttpClient;
  logger?: Logger;
}

/** Shape of the relevant subset of a GDELT 2.0 DOC ArtList response. */
interface GdeltResponse {
  articles?: Array<{
    url?: string | null;
    title?: string | null;
    seendate?: string | null;
    socialimage?: string | null;
    domain?: string | null;
    language?: string | null;
  }>;
}

/**
 * Adapter for the GDELT 2.0 DOC API
 * (https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts).
 *
 * No API key is required. Enabled purely by configuration flag.
 */
export class GdeltProvider implements NewsProvider {
  readonly name = PROVIDER_NAME;
  readonly enabled: boolean;
  private readonly http: HttpClient;
  private readonly logger: Logger;

  constructor(options: GdeltOptions) {
    this.enabled = options.enabled;
    this.http = options.http;
    this.logger = options.logger ?? noopLogger;
  }

  async search(query: NewsSearchQuery): Promise<RawNewsItem[]> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('query', buildQuery(query.keywords));
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('format', 'json');
    url.searchParams.set('sort', 'DateDesc');
    url.searchParams.set('maxrecords', String(Math.min(query.limit, 250)));
    // Use a relative timespan rather than absolute start/end datetimes: GDELT
    // computes it against its own latest data, so it is immune to clock skew on
    // the host (an absolute window in the "future" would return nothing).
    url.searchParams.set('timespan', toTimespan(query.from));

    try {
      const body = await this.http.getJson<GdeltResponse>(url.toString());
      const articles = body.articles ?? [];
      this.logger.info(`[${PROVIDER_NAME}] received ${articles.length} article(s)`);
      return articles
        .filter((article) => article.title && article.url)
        .map((article) => ({
          title: article.title!,
          url: article.url!,
          source: article.domain ?? undefined,
          publishedAt: parseSeenDate(article.seendate),
          imageUrl: article.socialimage ?? undefined,
          language: article.language ?? undefined,
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

/**
 * Build a GDELT boolean query: quote EVERY term and OR a bounded number of them.
 *
 * Quoting is not just for multi-word phrases — GDELT treats a bare hyphen as a
 * NOT operator, so an unquoted token like `GPT-5` or `fine-tuning` corrupts the
 * query and GDELT answers with a plain-text "Your query…" error instead of JSON.
 * Quoting neutralises hyphens/digits and is harmless for plain words.
 *
 * Keywords that tokenise to anything shorter than {@link MIN_TERM_LENGTH} (e.g.
 * the `5` in `GPT-5`, the `3` in `Llama 3`) are dropped: GDELT rejects them as
 * "too short" and a single bad term fails the entire request. The drop happens
 * before the cap so we keep up to MAX_QUERY_TERMS *usable* terms.
 */
function buildQuery(keywords: string[]): string {
  const terms = keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .filter(isGdeltSafe)
    .slice(0, MAX_QUERY_TERMS)
    .map((keyword) => `"${keyword}"`);
  return terms.length > 1 ? `(${terms.join(' OR ')})` : (terms[0] ?? '');
}

/** True when every word-token in `keyword` is long enough for GDELT to accept. */
function isGdeltSafe(keyword: string): boolean {
  const tokens = keyword.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 0);
  return tokens.length > 0 && tokens.every((token) => token.length >= MIN_TERM_LENGTH);
}

/**
 * Express the lookback window (`now - from`) as a GDELT `timespan` string.
 * The absolute clock value is irrelevant — only the size of the window matters,
 * and GDELT anchors it to its own most recent data.
 */
function toTimespan(from: Date): string {
  const hours = Math.max(1, Math.round((Date.now() - from.getTime()) / HOUR_MS));
  return hours <= 72 ? `${hours}h` : `${Math.ceil(hours / 24)}d`;
}

/** GDELT `seendate` looks like `20260623T120000Z`; convert to ISO-8601. */
function parseSeenDate(seendate?: string | null): string | undefined {
  if (!seendate) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
