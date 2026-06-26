import type { NewsProvider, NewsSearchQuery, RawNewsItem } from '../domain/types.js';
import type { HttpClient } from '../http/client.js';
import { maskUrl } from '../http/client.js';
import { noopLogger, type Logger } from '../logging/logger.js';

const PROVIDER_NAME = 'gdelt';
const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

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
    url.searchParams.set('startdatetime', toGdeltTime(query.from));
    url.searchParams.set('enddatetime', toGdeltTime(new Date()));

    try {
      const body = await this.http.getJson<GdeltResponse>(url.toString());
      return (body.articles ?? [])
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

/** Build a GDELT boolean query, quoting multi-word phrases and OR-ing terms. */
function buildQuery(keywords: string[]): string {
  const terms = keywords.map((keyword) => (keyword.includes(' ') ? `"${keyword}"` : keyword));
  return terms.length > 1 ? `(${terms.join(' OR ')})` : (terms[0] ?? '');
}

/** GDELT expects `YYYYMMDDHHMMSS` in UTC. */
function toGdeltTime(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
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
